import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Prompt System ────────────────────────────────────────────────────────────
const PROMPTS: Record<string, Record<string, string>> = {
  "Living Room": {
    Modern:
      "oversized modular linen sectional sofa in warm ivory, honed travertine slab coffee table, " +
      "hand-knotted jute area rug, a single minimalist ceramic vase, fiddle leaf fig in corner",
    Minimalist:
      "low-profile ivory boucle sofa, single travertine slab coffee table, " +
      "monochromatic neutral palette, deliberate negative space",
    Scandinavian:
      "ivory bouclé lounge chairs, light ash coffee table, sheepskin throw, " +
      "textured wool area rug in warm oat, potted Monstera",
    Industrial:
      "deep charcoal velvet sofa, blackened steel and reclaimed oak coffee table, " +
      "vintage cognac leather armchair, abstract oil painting",
    "Mid-Century Modern":
      "walnut credenza, Eames-inspired lounge chair in cognac leather, Saarinen tulip side table, " +
      "geometric kilim area rug in burnt sienna",
    Bohemian:
      "low-slung rattan daybed with linen cushions, layered Moroccan rugs, " +
      "bird of paradise plant, hand-hammered brass side table",
  },
  Kitchen: {
    Modern:
      "linen-cushioned counter stools with brushed brass legs at island, " +
      "a single elegant white ceramic bowl on countertop, minimalistic and clean",
    Minimalist:
      "minimal white upholstered counter stools at island, single orchid in ceramic pot on countertop",
    Scandinavian:
      "light oak counter stools at island, wooden bowl on countertop, clean and empty background",
    Industrial:
      "black metal counter stools at island, concrete-effect ceramic object on counter",
    "Mid-Century Modern":
      "walnut-finished counter stools at island, simple ceramic canister",
    Bohemian:
      "rattan counter stools at island, trailing pothos in a corner",
  },
  Bedroom: {
    Modern:
      "upholstered platform bed in warm ivory linen, matching nightstands, " +
      "cashmere throw, minimal decor",
    Minimalist:
      "low-profile platform bed in white linen, wabi-sabi ceramic object on nightstand",
    Scandinavian:
      "white oak platform bed with linen bedding, sheepskin throw, wool runner",
    Industrial:
      "upholstered bed in charcoal linen, blackened steel nightstands, cognac leather bench at foot",
    "Mid-Century Modern":
      "walnut platform bed, walnut nightstands, low walnut dresser",
    Bohemian:
      "low rattan bed with layered linen bedding, layered area rugs",
  },
  "Dining Room": {
    Modern:
      "solid white oak dining table, upholstered linen dining chairs, " +
      "white oak sideboard, minimal botanical centerpiece",
    Minimalist:
      "minimal slab dining table, simple linen chairs, single ceramic vase",
    Scandinavian:
      "light ash dining table, white upholstered chairs, linen table runner",
    Industrial:
      "reclaimed oak dining table, black metal chairs, concrete sideboard",
    "Mid-Century Modern":
      "walnut dining table, tulip-inspired chairs, walnut credenza",
    Bohemian:
      "rustic wood dining table, rattan chairs, mixed ceramic table setting",
  },
  Office: {
    Modern:
      "executive white oak desk, leather task chair, clean desktop",
    Minimalist:
      "minimal floating desk, simple task chair, monochromatic objects",
    Scandinavian:
      "light oak desk, white task chair, simple plant",
    Industrial:
      "blackened steel and reclaimed wood desk, cognac leather chair",
    "Mid-Century Modern":
      "walnut executive desk, Eames task chair in cognac leather",
    Bohemian:
      "rattan and reclaimed wood desk, linen chair",
  },
  Bathroom: {
    Modern:
      "rolled linen towels, single orchid, minimal candles",
    Minimalist:
      "single orchid, clean ceramic accessories, folded linen towels",
    Scandinavian:
      "wooden bath mat, linen towels, eucalyptus branch",
    Industrial:
      "concrete accessories, towels in metal basket",
    "Mid-Century Modern":
      "ceramic accessories, eucalyptus, amber candles",
    Bohemian:
      "terracotta accessories, trailing pothos, candles",
  },
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
    const style = (formData.get("style") as string) || "Modern";

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // ── Step 1: Upload ───────────────────────────────────────────────────────
    console.log("[1/2] Uploading...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    const imageUrl = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    console.log(`[1/2] ✓ Uploaded to ${imageUrl}`);

    // ── Step 2: Generate Staging ─────────────────────────────────────────────
    console.log("[2/2] Generating staging with flux-2-lora-gallery/apartment-staging...");

    const roomPrompts = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const promptStyle = roomPrompts[style] ?? roomPrompts["Modern"];
    const prompt = `${promptStyle}`;

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
