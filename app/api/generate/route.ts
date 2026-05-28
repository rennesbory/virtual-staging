import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Prompt System ────────────────────────────────────────────────────────────
const PROMPTS: Record<string, string> = {
  "Living Room": "ivory linen sofa, travertine coffee table, neutral rug, minimal decor",
  Kitchen: "minimal white upholstered counter stools at island, single orchid in ceramic pot on countertop",
  Bedroom: "ivory linen bed, ivory nightstands, minimal decor",
  "Dining Room": "white oak dining table, ivory linen chairs, minimal decor",
  Office: "executive white oak desk, leather task chair, clean desktop, minimal decor",
  Bathroom: "rolled linen towels, single orchid, minimal candles",
};

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image
//   2. Call fal-ai/flux-2-lora-gallery/apartment-staging
//   3. Return generated image
//
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    const roomType = (formData.get("roomType") as string) || "Living Room";
    const promptBase = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const prompt = `${promptBase}, architectural photography, 8k resolution, highly detailed interior design, photorealistic, cinematic lighting`;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // ── Step 1: Upload ───────────────────────────────────────────────────────
    console.log("[1/2] Uploading...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    const uploadResult = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    const imageUrl = typeof uploadResult === 'string' ? uploadResult : (uploadResult as any).url;
    console.log(`[1/2] ✓ Uploaded to ${imageUrl}`);

    const result = await fal.subscribe("fal-ai/flux-2-lora-gallery/apartment-staging", {
      input: {
        image_urls: [imageUrl],
        prompt: prompt
      },
      logs: true,
    });

    const generatedUrl = (result.data as any).images?.[0]?.url || (result.data as any).image?.url;
    if (!generatedUrl) {
      console.error("Fal response:", result.data);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
    console.log("[2/2] ✓ Generated:", generatedUrl);

    return NextResponse.json({ imageUrl: generatedUrl });

  } catch (err: unknown) {
    console.error("[Pipeline] Error:", err);
    const e = err as { status?: number; body?: { detail?: string } };
    if (e.status === 403) {
      return NextResponse.json(
        { error: e.body?.detail ?? "Forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
