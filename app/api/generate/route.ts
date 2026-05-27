import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Types ────────────────────────────────────────────────────────────────────

type StagingOutput = {
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

// ─── Depth-guided compositing ─────────────────────────────────────────────────
//
// Midas depth convention: bright = near camera, dark = far.
//   Near (bright) = floor / foreground  → use STAGED  (furniture lives here)
//   Far  (dark)   = walls / cabinets    → use ORIGINAL (preserve structure)
//   Top 20%       = ceiling             → always ORIGINAL
//
// Smooth blend in the transition zone to avoid hard seams.
//
async function compositeWithDepth(
  originalBuffer: Buffer,
  stagedUrl: string,
  depthUrl: string,
  W: number,
  H: number
): Promise<Buffer> {
  const [stagedBuf, depthBuf] = await Promise.all([
    fetch(stagedUrl).then((r) => r.arrayBuffer()).then(Buffer.from),
    fetch(depthUrl).then((r) => r.arrayBuffer()).then(Buffer.from),
  ]);

  const [origRaw, stagedRaw, depthRaw] = await Promise.all([
    sharp(originalBuffer).resize(W, H).removeAlpha().raw().toBuffer(),
    sharp(stagedBuf).resize(W, H).removeAlpha().raw().toBuffer(),
    sharp(depthBuf).resize(W, H).greyscale().raw().toBuffer(),
  ]);

  const out = Buffer.alloc(W * H * 3);

  for (let i = 0; i < W * H; i++) {
    const p = i * 3;
    const y = Math.floor(i / W);
    const yRatio = y / H;
    const d = depthRaw[i]; // 0–255  bright = near = floor

    let t: number; // 0 = full original, 1 = full staged

    if (yRatio < 0.20) {
      // Ceiling band — always original
      t = 0;
    } else if (d >= 90) {
      // Bright foreground (floor / furniture zone) — use staged
      t = 1;
    } else if (d >= 55) {
      // Transition zone — smooth linear blend
      t = (d - 55) / 35;
    } else {
      // Dark background (walls, cabinets, windows) — use original
      t = 0;
    }

    out[p]     = Math.round(origRaw[p]     * (1 - t) + stagedRaw[p]     * t);
    out[p + 1] = Math.round(origRaw[p + 1] * (1 - t) + stagedRaw[p + 1] * t);
    out[p + 2] = Math.round(origRaw[p + 2] * (1 - t) + stagedRaw[p + 2] * t);
  }

  return sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image
//   2. [PARALLEL] apartment-staging + depth map generation
//   3. Depth-guided compositing (original structure + staged furniture)
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

    // ── Step 2: Parallel — staging + depth ──────────────────────────────────
    console.log("[2/3] Staging + depth (parallel)...");

    const prompt =
      `Furnish this room. ${ROOM_PROMPTS[roomType] ?? ROOM_PROMPTS["Living Room"]}. ` +
      `${STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Modern"]}. ` +
      `${BASE_QUALITY}.`;

    const [stagingResult, depthResult] = await Promise.all([
      fal.subscribe("fal-ai/flux-2-lora-gallery/apartment-staging", {
        input: {
          image_urls: [imageUrl],
          prompt,
          lora_scale: 1,
          guidance_scale: 3.5,
          num_inference_steps: 40,
          num_images: 1,
          output_format: "jpeg",
        },
        logs: true,
      }),
      fal.subscribe("fal-ai/imageutils/depth", {
        input: { image_url: imageUrl },
      }),
    ]);

    const stagedUrl = (stagingResult.data as StagingOutput).images?.[0]?.url;
    const depthUrl = (depthResult.data as DepthOutput).image?.url;

    if (!stagedUrl) {
      return NextResponse.json(
        { error: "Staging failed" },
        { status: 500 }
      );
    }

    console.log("[2/3] ✓ Staged:", stagedUrl);
    console.log("[2/3] ✓ Depth:", depthUrl);

    // ── Step 3: Composite — original structure + staged furniture ────────────
    // If depth map unavailable, fall back to staged image directly
    if (!depthUrl) {
      console.log("[3/3] No depth map — returning staged directly");
      return NextResponse.json({ imageUrl: stagedUrl });
    }

    console.log("[3/3] Compositing...");
    const compositeBuf = await compositeWithDepth(
      imageBuffer,
      stagedUrl,
      depthUrl,
      W,
      H
    );

    const compositeUrl = await fal.storage.upload(
      new File(
        [compositeBuf.buffer as ArrayBuffer],
        "staged-composite.jpg",
        { type: "image/jpeg" }
      )
    );

    console.log("[3/3] ✓ Done:", compositeUrl);
    return NextResponse.json({ imageUrl: compositeUrl });

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
