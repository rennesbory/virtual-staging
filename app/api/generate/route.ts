import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Types ────────────────────────────────────────────────────────────────────

type InpaintingOutput = {
  images: { url: string; width: number; height: number }[];
  seed: number;
};

type DepthOutput = {
  image: { url: string; width: number; height: number };
};

// ─── Luxury Prompt System ─────────────────────────────────────────────────────
//
// Each room type has dedicated prompts per style.
// Items are ONLY appropriate for that room — no cross-contamination.
// (e.g. Kitchen never gets sofa/rug, Living Room never gets bar stools)
//
const PROMPTS: Record<string, Record<string, string>> = {
  "Living Room": {
    Modern:
      "oversized modular linen sectional sofa in warm ivory, honed travertine slab coffee table, " +
      "sculptural brushed brass floor lamp, natural white oak side tables, " +
      "hand-knotted jute area rug, organic ceramic vessels, fiddle leaf fig in terracotta pot",
    Minimalist:
      "low-profile ivory boucle sofa, single travertine slab coffee table, refined arc floor lamp, " +
      "wabi-sabi ceramic objects, monochromatic neutral palette, deliberate negative space",
    Scandinavian:
      "ivory bouclé lounge chairs, light ash coffee table, sheepskin throw, " +
      "textured wool area rug in warm oat, potted Monstera, handcrafted rattan pendant lamp",
    Industrial:
      "deep charcoal velvet sofa, blackened steel and reclaimed oak coffee table, " +
      "vintage cognac leather armchair, antique brass Edison pendant lights, abstract oil painting",
    "Mid-Century Modern":
      "walnut credenza, Eames-inspired lounge chair in cognac leather, Saarinen tulip side table, " +
      "warm amber arc floor lamp, geometric kilim area rug in burnt sienna",
    Bohemian:
      "low-slung rattan daybed with linen cushions, layered Moroccan rugs, " +
      "macramé wall installation, bird of paradise plant, hand-hammered brass side table",
  },

  Kitchen: {
    Modern:
      "linen-cushioned counter stools with brushed brass legs placed at the kitchen island, " +
      "brushed brass pendant lights hanging above the kitchen island, " +
      "white ceramic herb pots with fresh herbs on countertop, curated stoneware on open shelves, " +
      "potted monstera plant in corner",
    Minimalist:
      "minimal white upholstered counter stools at the kitchen island, " +
      "single orchid in white ceramic pot on countertop, " +
      "clean white ceramic objects on shelves, brushed metal pendant lights above island",
    Scandinavian:
      "light oak counter stools at kitchen island, ceramic bowls and mugs on countertop, " +
      "fresh herbs in terracotta pots on counter, rattan pendant lights above island, " +
      "potted plant on windowsill",
    Industrial:
      "black metal counter stools at kitchen island, concrete-effect ceramic objects on counter, " +
      "Edison pendant lights hanging above island, potted fern on counter shelf",
    "Mid-Century Modern":
      "walnut-finished counter stools at kitchen island, warm brass pendant lights above island, " +
      "ceramic canisters on countertop, small potted fern",
    Bohemian:
      "rattan counter stools at kitchen island, terracotta herb pots on countertop, " +
      "macramé pendant lights above island, trailing pothos on open shelf, mixed ceramic objects",
  },

  Bedroom: {
    Modern:
      "upholstered platform bed in warm ivory linen, matching nightstands with sculptural table lamps, " +
      "low white oak dresser, accent armchair in ivory boucle, cashmere throw draped on bed",
    Minimalist:
      "low-profile platform bed in white linen, single sculptural table lamp on minimal nightstand, " +
      "wabi-sabi ceramic object, clean lines and deliberate negative space",
    Scandinavian:
      "white oak platform bed with linen bedding, sheepskin throw, " +
      "rattan pendant bedside lamp, potted plant, textured wool runner at foot of bed",
    Industrial:
      "upholstered bed in charcoal linen, blackened steel nightstands, " +
      "industrial wall sconces, cognac leather bench at foot of bed",
    "Mid-Century Modern":
      "walnut platform bed frame, ceramic table lamps on walnut nightstands, " +
      "low walnut dresser, geometric area rug beside bed",
    Bohemian:
      "low rattan bed with layered linen bedding, macramé wall hanging above headboard, " +
      "trailing pothos in corner, layered area rugs, brass table lamp",
  },

  "Dining Room": {
    Modern:
      "solid white oak dining table, upholstered dining chairs in warm linen, " +
      "sculptural brass chandelier above table, white oak sideboard against wall, botanical centerpiece on table",
    Minimalist:
      "minimal white slab dining table, simple upholstered chairs in neutral linen, " +
      "single pendant light above table, ceramic vase centerpiece",
    Scandinavian:
      "light ash dining table, white upholstered dining chairs, rattan pendant chandelier, " +
      "potted plant in corner, linen table runner",
    Industrial:
      "reclaimed oak dining table, black metal-framed dining chairs, " +
      "Edison pendant lights above table, concrete-effect sideboard",
    "Mid-Century Modern":
      "walnut dining table, tulip-inspired dining chairs in warm upholstery, " +
      "warm brass chandelier above table, walnut credenza",
    Bohemian:
      "rustic wood dining table, rattan and linen dining chairs, " +
      "macramé pendant light, mixed ceramic table setting, potted plants",
  },

  Office: {
    Modern:
      "executive white oak desk, leather task chair, floor-to-ceiling open shelving with curated books, " +
      "sculptural brass table lamp, potted fiddle leaf fig",
    Minimalist:
      "minimal floating white desk, simple task chair, single potted plant, " +
      "monochromatic objects, clean surfaces",
    Scandinavian:
      "light oak desk, simple white task chair, open shelving with books and plants, " +
      "pendant desk lamp, potted plant",
    Industrial:
      "blackened steel and reclaimed wood desk, cognac leather task chair, " +
      "industrial open shelf with books, Edison desk lamp",
    "Mid-Century Modern":
      "walnut executive desk, Eames-style task chair in cognac leather, " +
      "warm amber desk lamp, curated books on walnut shelf",
    Bohemian:
      "rattan and reclaimed wood desk, linen-cushioned chair, " +
      "open shelving with books and plants, macramé wall art",
  },

  Bathroom: {
    Modern:
      "freestanding oval soaking tub, brushed brass fixtures, " +
      "rolled linen towels on marble ledge, white ceramic soap dish, potted orchid, architectural pillar candles",
    Minimalist:
      "freestanding minimal soaking tub, single white orchid, " +
      "clean ceramic accessories, neatly folded linen towels",
    Scandinavian:
      "white freestanding soaking tub, wooden bath mat, neatly folded linen towels, " +
      "eucalyptus branch, ceramic soap dispenser",
    Industrial:
      "freestanding soaking tub with matte black fixtures, " +
      "concrete accessories, rolled towels in black metal basket, Edison mirror sconce",
    "Mid-Century Modern":
      "freestanding soaking tub with brushed brass fixtures, " +
      "ceramic accessories, fresh eucalyptus, warm amber candles",
    Bohemian:
      "freestanding soaking tub surrounded by plants, " +
      "terracotta accessories, trailing pothos on shelf, pillar candles, macramé bath mat",
  },
};

// Room-specific negative prompts — block furniture that doesn't belong
const NEGATIVE_PROMPTS: Record<string, string> = {
  "Living Room":
    "bed, mattress, kitchen appliances, bar stools, office desk, bathroom, toilet",
  Kitchen:
    "sofa, couch, sectional, area rug, coffee table, floor lamp, armchair, " +
    "credenza, daybed, living room furniture, bedroom furniture",
  Bedroom:
    "sofa, couch, sectional, coffee table, dining table, kitchen appliances, bar stools",
  "Dining Room":
    "sofa, couch, sectional, bed, kitchen appliances, office desk, bar stools",
  Office:
    "sofa, couch, sectional, bed, dining table, kitchen appliances, bathroom",
  Bathroom:
    "sofa, couch, bed, dining table, kitchen appliances, bar stools, office desk",
};

const BASE_QUALITY =
  "RH Restoration Hardware aesthetic, photorealistic luxury interior photography, " +
  "Architectural Digest editorial quality, 8K resolution, " +
  "soft diffused natural daylight, warm ambient shadows, " +
  "professional luxury real estate photography for 10 million dollar property";

// ─── Floor Mask from Depth Map ────────────────────────────────────────────────
//
// Midas depth convention: bright = near camera (floor), dark = far (walls/ceiling)
// Inpainting mask: white (255) = AI modifies here, black (0) = preserve original
//
// Result: AI only touches the floor area — walls, cabinets, ceiling are
// pixel-perfect original (not even blended, literally untouched).
//
async function generateFloorMask(
  depthUrl: string,
  W: number,
  H: number
): Promise<Buffer> {
  const depthBuf = await fetch(depthUrl)
    .then((r) => r.arrayBuffer())
    .then(Buffer.from);

  const depthRaw = await sharp(depthBuf)
    .resize(W, H)
    .greyscale()
    .raw()
    .toBuffer();

  const maskRaw = Buffer.alloc(W * H);

  for (let i = 0; i < W * H; i++) {
    const y = Math.floor(i / W);
    const yRatio = y / H;
    const d = depthRaw[i]; // 0–255, bright = near = floor

    if (yRatio < 0.20) {
      // Ceiling band — always preserve
      maskRaw[i] = 0;
    } else if (d >= 85) {
      // Floor / foreground — inpaint here (furniture goes here)
      maskRaw[i] = 255;
    } else if (d >= 55) {
      // Soft transition edge — feather the boundary
      maskRaw[i] = Math.round(((d - 55) / 30) * 255);
    } else {
      // Walls / cabinets / background — preserve original pixel
      maskRaw[i] = 0;
    }
  }

  return sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image
//   2. Depth map → floor mask (auto-detect floor area)
//   3. Flux inpainting — furniture generated in floor area only
//      Walls / cabinets / ceiling = 100% original (mask black = untouched)
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

    // ── Step 1: Upload ───────────────────────────────────────────────────────
    console.log("[1/3] Uploading...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const { width: W = 1024, height: H = 768 } =
      await sharp(imageBuffer).metadata();

    const imageUrl = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    console.log(`[1/3] ✓ ${W}×${H}`);

    // ── Step 2: Depth map → floor mask ──────────────────────────────────────
    console.log("[2/3] Depth map + floor mask...");
    const depthResult = await fal.subscribe("fal-ai/imageutils/depth", {
      input: { image_url: imageUrl },
    });

    const depthUrl = (depthResult.data as DepthOutput).image?.url;
    if (!depthUrl) {
      return NextResponse.json(
        { error: "Depth map failed" },
        { status: 500 }
      );
    }

    const maskBuffer = await generateFloorMask(depthUrl, W, H);
    const maskUrl = await fal.storage.upload(
      new File([maskBuffer.buffer as ArrayBuffer], "floor-mask.png", {
        type: "image/png",
      })
    );
    console.log("[2/3] ✓ Floor mask ready");

    // ── Step 3: Inpainting — furniture in masked floor area only ─────────────
    console.log("[3/3] Inpainting furniture...");

    const roomPrompts = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const furniturePrompt = roomPrompts[style] ?? roomPrompts["Modern"];
    const negativePrompt =
      NEGATIVE_PROMPTS[roomType] ??
      "low quality, blurry, distorted, deformed, unrealistic";

    const prompt = `${furniturePrompt}. ${BASE_QUALITY}.`;

    console.log(`[3/3] Room: ${roomType}, Style: ${style}`);
    console.log(`[3/3] Prompt: ${prompt.slice(0, 120)}...`);

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt,
        negative_prompt: negativePrompt,
        num_inference_steps: 40,
        strength: 0.99,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: "jpeg",
      },
      logs: true,
    });

    const outputUrl = (result.data as InpaintingOutput).images?.[0]?.url;
    if (!outputUrl) {
      return NextResponse.json(
        { error: "Inpainting failed" },
        { status: 500 }
      );
    }

    console.log("[3/3] ✓ Done:", outputUrl);
    return NextResponse.json({ imageUrl: outputUrl });

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
