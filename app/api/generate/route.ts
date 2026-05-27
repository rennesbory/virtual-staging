import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

type SamOutput = {
  masks?: { url: string; score?: number }[];
  image?: { url: string };
};

type FluxOutput = {
  images: { url: string }[];
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    const roomType = formData.get("roomType") as string;
    const style = formData.get("style") as string;

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Step 1: Upload image to fal.ai storage
    const imageUrl = await fal.storage.upload(image);
    console.log("[SAM] Uploaded image URL:", imageUrl);

    // Step 2: Auto-detect floor area using SAM-3
    // Use descriptive text prompt + return_multiple_masks: false for best single mask
    let samResult;
    try {
      samResult = await fal.subscribe("fal-ai/sam-3/image", {
        input: {
          image_url: imageUrl,
          prompt: "floor, hardwood floor, tile floor, carpet, flooring surface",
          apply_mask: false,
          output_format: "png",
          return_multiple_masks: false,
        },
        logs: true,
      });
    } catch (samErr: unknown) {
      const e = samErr as { status?: number; body?: unknown; message?: string };
      console.error("[SAM] API error — status:", e.status, "body:", JSON.stringify(e.body));
      throw samErr;
    }

    console.log("[SAM] Raw response data:", JSON.stringify(samResult?.data));

    const samData = samResult.data as SamOutput;
    const maskUrl = samData.masks?.[0]?.url;

    if (!maskUrl) {
      console.error("[SAM] No mask returned. Full data:", JSON.stringify(samData));
      return NextResponse.json(
        { error: "Could not detect floor area. Try a different image." },
        { status: 422 }
      );
    }

    console.log("[SAM] Mask URL:", maskUrl, "score:", samData.masks?.[0]?.score);

    // Step 3: Inpaint furniture onto the floor mask
    // strength 0.45: preserves existing floor texture while adding furniture on top
    // (0.85 was too high → completely replaced floor material)
    const prompt = [
      `${style} style ${roomType.toLowerCase()} with furniture:`,
      "sofa, coffee table, area rug, side tables, decorative lamps, cushions,",
      "professionally staged, photorealistic interior design photography,",
      "preserve existing floor material and color,",
      "preserve ceiling and wall colors, matching room lighting and perspective",
    ].join(" ");

    const negativePrompt = [
      "change floor texture, replace flooring, different floor material,",
      "change ceiling color, change wall color, alter room structure,",
      "cartoon, illustration, unrealistic, distorted, blurry",
    ].join(" ");

    console.log("[Flux] Starting inpainting with prompt:", prompt);

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image_url: imageUrl,
        mask_url: maskUrl,
        strength: 0.45,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: "jpeg",
      },
      logs: true,
    });

    const data = result.data as FluxOutput;
    if (data.images?.[0]?.url) {
      console.log("[Flux] Generated image URL:", data.images[0].url);
      return NextResponse.json({
        imageUrl: data.images[0].url,
        maskUrl,
      });
    }

    return NextResponse.json(
      { error: "No image was generated" },
      { status: 500 }
    );
  } catch (err: unknown) {
    console.error("[Generate] Error:", err);

    const falError = err as { status?: number; body?: { detail?: string } };
    if (falError.status === 403) {
      const detail = falError.body?.detail ?? "Forbidden";
      return NextResponse.json({ error: detail }, { status: 403 });
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
