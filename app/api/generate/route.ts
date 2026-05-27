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

// ─── Luxury Prompt System (RH / 10M+ market) ─────────────────────────────────

const STYLE_PROMPTS: Record<string, string> = {
  Modern:
    "oversized modular linen sectional in warm ivory, " +
    "honed travertine coffee table, sculptural brushed brass floor lamp, " +
    "natural white oak slab side tables, hand-knotted jute area rug, " +
    "ceramic vessels and organic sculptural objects, fiddle leaf fig tree in terracotta pot",

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
    "large sectional sofa, statement coffee table, " +
    "layered area rugs, sculptural floor lamp, organic side tables, decorative objects, framed art",
  Bedroom:
    "upholstered platform bed with linen bedding, " +
    "nightstands with table lamps, low dresser, accent armchair in corner",
  Kitchen:
    "upholstered counter stools at kitchen island, " +
    "pendant lights above island, fresh herb pots on counter, curated ceramic objects on shelves",
  "Dining Room":
    "solid wood dining table with upholstered dining chairs, " +
    "sculptural chandelier above table, sideboard against wall, botanical centerpiece",
  Office:
    "executive desk with leather task chair, " +
    "floor-to-ceiling shelving with curated books, sculptural task lamp, potted plant",
  Bathroom:
    "freestanding soaking tub, stone vanity accessories, " +
    "rolled linen towels on rack, architectural candles, potted orchid",
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
    const prompt =
      `${ROOM_PROMPTS[roomType] ?? ROOM_PROMPTS["Living Room"]}. ` +
      `${STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Modern"]}. ` +
      `${BASE_QUALITY}.`;

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt,
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
