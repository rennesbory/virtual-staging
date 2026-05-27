import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Types ────────────────────────────────────────────────────────────────────

type DepthOutput = {
  image: { url: string; width: number; height: number };
};

type StagingOutput = {
  images: { url: string; width: number; height: number }[];
  seed: number;
};

// ─── Luxury Prompt System (RH / 10M+ market) ─────────────────────────────────

const STYLE_PROMPTS: Record<string, string> = {
  Modern:
    "oversized modular linen sectional in warm ivory, " +
    "honed travertine coffee table, sculptural brushed brass floor lamp, " +
    "natural white oak slab side tables, hand-knotted jute area rug, " +
    "ceramic vessels and organic sculptural objects, fiddle leaf fig tree",

  Minimalist:
    "architectural low-profile sofa in ivory boucle, " +
    "single slab travertine coffee table, refined arc floor lamp, " +
    "deliberate negative space, large-format abstract canvas, " +
    "monochromatic neutral palette, wabi-sabi ceramic objects",

  Scandinavian:
    "light ash and white oak furniture, ivory bouclé lounge chairs, " +
    "sheepskin throw, handcrafted rattan pendant lamp, " +
    "linen curtains pooling on floor, potted Monstera and olive tree, " +
    "textured wool area rug in warm oat",

  Industrial:
    "deep charcoal velvet sofa, blackened steel and reclaimed oak coffee table, " +
    "antique brass Edison pendant lights, vintage cognac leather armchair, " +
    "oversized abstract oil painting, raw concrete accents",

  "Mid-Century Modern":
    "walnut credenza and side tables, Eames-inspired lounge chair in cognac leather, " +
    "sculptural Saarinen tulip table, warm amber arc floor lamp, " +
    "geometric kilim area rug in burnt sienna",

  Bohemian:
    "low-slung rattan daybed with linen cushions, layered Moroccan rugs, " +
    "macramé wall installation, trailing pothos and bird of paradise, " +
    "hand-hammered brass side table",
};

const ROOM_PROMPTS: Record<string, string> = {
  "Living Room":
    "living room with large sectional sofa, statement coffee table, " +
    "layered area rugs, floor lamp, organic side tables, decorative objects, art",
  Bedroom:
    "bedroom with upholstered platform bed, linen bedding, " +
    "nightstands with table lamps, low dresser, accent armchair",
  Kitchen:
    "kitchen with upholstered bar stools at island, " +
    "woven rattan pendant lights, fresh herb pots, curated ceramics on counter",
  "Dining Room":
    "dining room with solid wood dining table, upholstered dining chairs, " +
    "sculptural chandelier, credenza, botanical table centerpiece",
  Office:
    "home office with executive desk, leather task chair, " +
    "floor-to-ceiling shelving with curated books, sculptural task lamp",
  Bathroom:
    "bathroom with freestanding soaking tub, stone vanity accessories, " +
    "rolled linen towels, architectural candles, potted orchid",
};

const BASE_QUALITY =
  "RH Restoration Hardware aesthetic, photorealistic luxury interior photography, " +
  "Architectural Digest editorial quality, 8K resolution, " +
  "soft diffused natural daylight, warm ambient shadows, " +
  "professional luxury real estate photography for 10 million dollar property";

const NEGATIVE_PROMPT =
  "IKEA furniture, cheap materials, plastic, laminate, " +
  "change floor material, replace flooring, alter floor color or texture, " +
  "change wall color, modify ceiling, redesign cabinets, alter windows, " +
  "cartoon, illustration, CGI render, watermark, text, distorted, blurry, " +
  "overexposed, flat lighting, cluttered";

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image + extract dimensions
//   2. Generate Midas depth map
//   3. fal-ai/flux-control-lora-depth (img2img + depth ControlNet)
//      • image_url            = original photo  → color / material reference
//      • control_lora_image_url = depth map      → 3D structure lock
//      • strength 0.60        → adds furniture, preserves most of original
//      • control_lora_strength 0.65 → locks 3D perspective & lighting
//
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

    // ── Step 1: Upload + read dimensions ────────────────────────────────────
    console.log("[1/3] Uploading image...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const { width: W = 1024, height: H = 768 } =
      await sharp(imageBuffer).metadata();

    const imageUrl = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    console.log(`[1/3] ✓ ${W}×${H}  →  ${imageUrl}`);

    // ── Step 2: Depth map ────────────────────────────────────────────────────
    console.log("[2/3] Generating depth map...");
    const depthResult = await fal.subscribe("fal-ai/imageutils/depth", {
      input: { image_url: imageUrl },
    });
    const depthUrl = (depthResult.data as DepthOutput).image.url;
    console.log("[2/3] ✓ Depth:", depthUrl);

    // ── Step 3: Depth-guided img2img staging ─────────────────────────────────
    //
    // fal-ai/flux-control-lora-depth/image-to-image:
    //   • image_url              → original photo as color/material guide
    //   • control_lora_image_url → depth map locks 3D structure
    //   • strength 0.60          → enough freedom to add furniture,
    //                              not enough to replace floors/walls
    //   • control_lora_strength  → depth map adherence level
    //
    console.log("[3/3] Rendering staged room...");

    const prompt =
      `Furnish this empty room. ${ROOM_PROMPTS[roomType] ?? ROOM_PROMPTS["Living Room"]}. ` +
      `${STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Modern"]}. ` +
      `${BASE_QUALITY}. ` +
      `Preserve all existing surfaces: floor material and color, wall color, ` +
      `ceiling texture, cabinets, windows exactly as in the original photo.`;

    const result = await fal.subscribe(
      "fal-ai/flux-control-lora-depth/image-to-image",
      {
        input: {
          prompt,
          image_url: imageUrl,               // original → color reference
          control_lora_image_url: depthUrl,  // depth map → structure lock
          strength: 0.60,                    // img2img strength
          control_lora_strength: 0.65,       // depth adherence
          num_inference_steps: 35,
          guidance_scale: 4.0,
          image_size: { width: W, height: H },
          num_images: 1,
          output_format: "jpeg",
        },
        logs: true,
      }
    );

    const data = result.data as StagingOutput;

    if (data.images?.[0]?.url) {
      console.log("[3/3] ✓ Done:", data.images[0].url);
      return NextResponse.json({
        imageUrl: data.images[0].url,
        depthUrl,
      });
    }

    return NextResponse.json(
      { error: "No image was generated" },
      { status: 500 }
    );
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
