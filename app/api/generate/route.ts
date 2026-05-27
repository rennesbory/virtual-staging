import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

type StagingOutput = {
  images: { url: string; width: number; height: number }[];
  seed: number;
  prompt: string;
};

// Luxury style prompt presets — RH-grade quality
const STYLE_PROMPTS: Record<string, string> = {
  Modern:
    "modern luxury staging, oversized modular linen sectional sofa in warm ivory, " +
    "travertine stone coffee table, brushed brass floor lamp, " +
    "natural white oak side tables, organic jute area rug, " +
    "sculptural ceramic decorative objects, fiddle leaf fig tree, " +
    "soft diffused natural daylight, warm ambient shadows",

  Minimalist:
    "minimalist luxury staging, clean-lined low-profile sofa in cream boucle, " +
    "minimal travertine slab coffee table, single statement floor lamp, " +
    "monochromatic neutral palette, negative space intentional, " +
    "one curated art piece, subtle natural texture, whisper quiet elegance",

  Scandinavian:
    "Scandinavian luxury staging, light ash wood furniture, " +
    "ivory bouclé armchairs, sheepskin throw, rattan pendant lamp, " +
    "hygge warmth, natural linen curtains, potted greenery, " +
    "white oak herringbone details, cozy ambient light",

  Industrial:
    "high-end industrial staging, dark charcoal velvet sofa, " +
    "blackened steel and reclaimed oak coffee table, Edison pendant lights, " +
    "exposed concrete accents, aged leather armchair, " +
    "large format abstract art, moody dramatic lighting",

  "Mid-Century Modern":
    "mid-century modern luxury staging, walnut wood furniture, " +
    "Eames-inspired lounge chair in cognac leather, " +
    "sculptural tulip coffee table, warm amber floor lamp, " +
    "geometric area rug in earth tones, organic forms, " +
    "curated vintage art prints, warm incandescent glow",

  Bohemian:
    "bohemian luxury staging, layered natural textiles, " +
    "low-slung rattan sofa with linen cushions, macramé wall hanging, " +
    "moroccan-inspired patterned rug, trailing pothos and palms, " +
    "hammered brass side table, warm candlelit atmosphere, " +
    "curated global artifacts, rich layered textures",
};

const ROOM_PROMPTS: Record<string, string> = {
  "Living Room": "living room with sofa, coffee table, area rug, floor lamp, side tables, decorative objects",
  Bedroom: "bedroom with upholstered bed, nightstands, table lamps, dresser, linen bedding, accent chair",
  Kitchen: "kitchen with bar stools, pendant lights, fresh herbs, curated countertop accessories",
  "Dining Room": "dining room with dining table, upholstered chairs, sideboard, statement chandelier, table centerpiece",
  Office: "home office with executive desk, ergonomic chair, built-in shelving, task lamp, curated books",
  Bathroom: "bathroom with freestanding tub, vanity accessories, plush towels, candles, potted plant",
};

const BASE_QUALITY =
  "RH Restoration Hardware style, photorealistic interior photography, " +
  "Architectural Digest editorial quality, 8K high resolution, " +
  "professional staging, luxury real estate photography";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    const roomType = (formData.get("roomType") as string) || "Living Room";
    const style = (formData.get("style") as string) || "Modern";

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Step 1: Upload image to fal.ai storage
    console.log("[Staging] Uploading image...");
    const imageUrl = await fal.storage.upload(image);
    console.log("[Staging] Uploaded:", imageUrl);

    // Step 2: Build luxury prompt
    const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Modern"];
    const roomPrompt = ROOM_PROMPTS[roomType] ?? ROOM_PROMPTS["Living Room"];
    const prompt = `Furnish this room. ${roomPrompt}. ${stylePrompt}. ${BASE_QUALITY}.`;

    console.log("[Staging] Prompt:", prompt);

    // Step 3: Generate staged room
    const result = await fal.subscribe(
      "fal-ai/flux-2-lora-gallery/apartment-staging",
      {
        input: {
          image_urls: [imageUrl],   // array required
          prompt,
          lora_scale: 1,            // staging effect strength
          guidance_scale: 3.5,      // prompt adherence (tested optimal)
          num_inference_steps: 40,  // quality steps
          num_images: 1,
          output_format: "jpeg",
        },
        logs: true,
      }
    );

    const data = result.data as StagingOutput;

    if (data.images?.[0]?.url) {
      console.log("[Staging] Done:", data.images[0].url);
      return NextResponse.json({
        imageUrl: data.images[0].url,
        seed: data.seed,
      });
    }

    return NextResponse.json(
      { error: "No image was generated" },
      { status: 500 }
    );
  } catch (err: unknown) {
    console.error("[Staging] Error:", err);

    const falError = err as { status?: number; body?: { detail?: string } };
    if (falError.status === 403) {
      return NextResponse.json(
        { error: falError.body?.detail ?? "Forbidden" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
