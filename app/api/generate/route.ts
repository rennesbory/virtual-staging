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

// ─── Custom LoRA Config ───────────────────────────────────────────────────────
const STYLE_RH_LORA_URL = ""; // ← paste trained LoRA URL here
const STYLE_RH_LORA_SCALE = 0.8;

// ─── Prompt System ────────────────────────────────────────────────────────────
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
      "linen-cushioned counter stools with brushed brass legs at island, " +
      "brushed brass pendant lights above island, " +
      "white ceramic herb pots with fresh herbs on countertop, curated stoneware on open shelves",
    Minimalist:
      "minimal white upholstered counter stools at island, single orchid in ceramic pot on countertop, " +
      "brushed metal pendant lights above island",
    Scandinavian:
      "light oak counter stools at island, ceramic bowls on countertop, " +
      "fresh herbs in terracotta pots, rattan pendant lights above island",
    Industrial:
      "black metal counter stools at island, concrete-effect ceramic objects on counter, " +
      "Edison pendant lights above island",
    "Mid-Century Modern":
      "walnut-finished counter stools at island, warm brass pendant lights above island, ceramic canisters",
    Bohemian:
      "rattan counter stools at island, terracotta herb pots on countertop, " +
      "macramé pendant lights above island, trailing pothos on open shelf",
  },
  Bedroom: {
    Modern:
      "upholstered platform bed in warm ivory linen, matching nightstands with sculptural table lamps, " +
      "low white oak dresser, accent armchair in ivory boucle, cashmere throw",
    Minimalist:
      "low-profile platform bed in white linen, single sculptural table lamp, wabi-sabi ceramic object",
    Scandinavian:
      "white oak platform bed with linen bedding, sheepskin throw, rattan pendant lamp, wool runner",
    Industrial:
      "upholstered bed in charcoal linen, blackened steel nightstands, cognac leather bench at foot",
    "Mid-Century Modern":
      "walnut platform bed, ceramic table lamps on walnut nightstands, low walnut dresser",
    Bohemian:
      "low rattan bed with layered linen bedding, macramé wall hanging, layered area rugs, brass lamp",
  },
  "Dining Room": {
    Modern:
      "solid white oak dining table, upholstered linen dining chairs, sculptural brass chandelier, " +
      "white oak sideboard, botanical centerpiece",
    Minimalist:
      "minimal slab dining table, simple linen chairs, single pendant light, ceramic vase",
    Scandinavian:
      "light ash dining table, white upholstered chairs, rattan chandelier, linen table runner",
    Industrial:
      "reclaimed oak dining table, black metal chairs, Edison pendant lights, concrete sideboard",
    "Mid-Century Modern":
      "walnut dining table, tulip-inspired chairs, warm brass chandelier, walnut credenza",
    Bohemian:
      "rustic wood dining table, rattan chairs, macramé pendant, mixed ceramic table setting",
  },
  Office: {
    Modern:
      "executive white oak desk, leather task chair, floor-to-ceiling shelving with books, sculptural lamp",
    Minimalist:
      "minimal floating desk, simple task chair, single plant, monochromatic objects",
    Scandinavian:
      "light oak desk, white task chair, open shelving with books and plants, pendant lamp",
    Industrial:
      "blackened steel and reclaimed wood desk, cognac leather chair, Edison desk lamp",
    "Mid-Century Modern":
      "walnut executive desk, Eames task chair in cognac leather, warm amber desk lamp",
    Bohemian:
      "rattan and reclaimed wood desk, linen chair, open shelving with books and plants",
  },
  Bathroom: {
    Modern:
      "freestanding oval soaking tub, brushed brass fixtures, rolled linen towels, orchid, candles",
    Minimalist:
      "freestanding minimal soaking tub, single orchid, clean ceramic accessories, folded linen towels",
    Scandinavian:
      "white freestanding tub, wooden bath mat, linen towels, eucalyptus branch",
    Industrial:
      "freestanding tub with matte black fixtures, concrete accessories, towels in metal basket",
    "Mid-Century Modern":
      "freestanding tub with brushed brass fixtures, ceramic accessories, eucalyptus, amber candles",
    Bohemian:
      "freestanding tub with surrounding plants, terracotta accessories, trailing pothos, candles",
  },
};

const BASE_QUALITY =
  "RH Restoration Hardware aesthetic, photorealistic luxury interior photography, " +
  "Architectural Digest editorial quality, 8K resolution, " +
  "soft diffused natural daylight, warm ambient shadows, " +
  "professional luxury real estate photography for 10 million dollar property";

// ─── Floor Mask ───────────────────────────────────────────────────────────────
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
    const d = depthRaw[i];

    if (yRatio < 0.55) {
      maskRaw[i] = 0; // upper 55%: always preserve
    } else if (d >= 90) {
      maskRaw[i] = 255; // floor area: inpaint
    } else if (d >= 70) {
      maskRaw[i] = Math.round(((d - 70) / 20) * 255);
    } else {
      maskRaw[i] = 0;
    }
  }

  return sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// ─── Solution C: Diff-Based Furniture Compositing ─────────────────────────────
//
// Commercial virtual staging services use this post-processing trick:
//
//   1. Inpainting generates furniture + new floor (floor is redrawn)
//   2. Pixel diff (inpainted vs original) identifies WHERE furniture appeared
//      → high diff = new furniture object or shadow
//      → low diff  = floor slightly redrawn (discard, use original instead)
//   3. Composite: original floor pixels + AI furniture pixels only
//
// Result: original floor texture/color/wood grain is 100% preserved.
// Only the furniture (and its shadow) lands on top of the original floor.
//
async function compositeByDiff(
  originalBuffer: Buffer,
  inpaintedUrl: string,
  W: number,
  H: number
): Promise<Buffer> {
  const inpaintedBuf = await fetch(inpaintedUrl)
    .then((r) => r.arrayBuffer())
    .then(Buffer.from);

  const [origRaw, inpaintedRaw] = await Promise.all([
    sharp(originalBuffer).resize(W, H).removeAlpha().raw().toBuffer(),
    sharp(inpaintedBuf).resize(W, H).removeAlpha().raw().toBuffer(),
  ]);

  const out = Buffer.alloc(W * H * 3);

  for (let i = 0; i < W * H; i++) {
    const p = i * 3;
    const y = Math.floor(i / W);
    const yRatio = y / H;

    // Upper 55%: always original (cabinets, appliances, ceiling)
    if (yRatio < 0.55) {
      out[p]     = origRaw[p];
      out[p + 1] = origRaw[p + 1];
      out[p + 2] = origRaw[p + 2];
      continue;
    }

    // Lower 45%: diff-based furniture extraction
    const rDiff = Math.abs(inpaintedRaw[p]     - origRaw[p]);
    const gDiff = Math.abs(inpaintedRaw[p + 1] - origRaw[p + 1]);
    const bDiff = Math.abs(inpaintedRaw[p + 2] - origRaw[p + 2]);
    const totalDiff = rDiff + gDiff + bDiff; // 0–765

    // Soft threshold:
    //   diff < 60   → floor was just redrawn slightly → use ORIGINAL (preserve floor)
    //   diff 60–200 → shadow / furniture edge → gradual blend
    //   diff > 200  → furniture object → use INPAINTED
    let t: number;
    if (totalDiff < 60) {
      t = 0; // original floor
    } else if (totalDiff < 200) {
      t = (totalDiff - 60) / 140; // shadow / edge blend
    } else {
      t = 1; // furniture pixel
    }

    out[p]     = Math.round(origRaw[p]     * (1 - t) + inpaintedRaw[p]     * t);
    out[p + 1] = Math.round(origRaw[p + 1] * (1 - t) + inpaintedRaw[p + 1] * t);
    out[p + 2] = Math.round(origRaw[p + 2] * (1 - t) + inpaintedRaw[p + 2] * t);
  }

  return sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image
//   2. Depth map → conservative floor mask (upper 55% protected)
//   3. Flux inpainting + LoRA (if trained) + ControlNet depth (if enabled)
//      → generates furniture in floor area (floor texture will be redrawn)
//   4. Diff compositing (Solution C)
//      → extract only furniture + shadow pixels from inpainted result
//      → composite onto original image (original floor restored)
//
// LoRA training: set STYLE_RH_LORA_URL → handles furniture style/quality
// ControlNet:    uncomment controlnets[] → handles structure during generation
// Diff composite: always active → handles floor preservation post-generation
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
    console.log("[1/4] Uploading...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const { width: W = 1024, height: H = 768 } =
      await sharp(imageBuffer).metadata();

    const imageUrl = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    console.log(`[1/4] ✓ ${W}×${H}`);

    // ── Step 2: Depth map → floor mask ──────────────────────────────────────
    console.log("[2/4] Depth map + floor mask...");
    const depthResult = await fal.subscribe("fal-ai/imageutils/depth", {
      input: { image_url: imageUrl },
    });

    const depthUrl = (depthResult.data as DepthOutput).image?.url;
    if (!depthUrl) {
      return NextResponse.json({ error: "Depth map failed" }, { status: 500 });
    }

    const maskBuffer = await generateFloorMask(depthUrl, W, H);
    const maskUrl = await fal.storage.upload(
      new File([maskBuffer.buffer as ArrayBuffer], "floor-mask.png", {
        type: "image/png",
      })
    );
    console.log("[2/4] ✓ Floor mask ready");

    // ── Step 3: Inpainting (furniture generation) ────────────────────────────
    console.log("[3/4] Inpainting furniture...");

    const hasLoRA = STYLE_RH_LORA_URL.length > 0;
    const roomPrompts = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const prompt = hasLoRA
      ? `luxury staged interior, luxury_rh_style. ${BASE_QUALITY}.`
      : `${roomPrompts[style] ?? roomPrompts["Modern"]}. ${BASE_QUALITY}.`;

    const loraInput = hasLoRA
      ? [{ path: STYLE_RH_LORA_URL, scale: STYLE_RH_LORA_SCALE }]
      : [];

    console.log(`[3/4] LoRA: ${hasLoRA ? "✓ active" : "pending — using prompt"}`);

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt,
        num_inference_steps: 40,
        strength: 0.99,      // max strength — we restore original floor in step 4
        guidance_scale: 3.5,
        num_images: 1,
        output_format: "jpeg",
        ...(loraInput.length > 0 && { loras: loraInput }),
        // Solution B: ControlNet depth — enable for production
        // controlnets: [{
        //   path: "Shakker-Labs/FLUX.1-dev-ControlNet-Depth",
        //   image_url: depthUrl,
        //   conditioning_scale: 0.7,
        // }],
      },
      logs: true,
    });

    const inpaintedUrl = (result.data as InpaintingOutput).images?.[0]?.url;
    if (!inpaintedUrl) {
      return NextResponse.json({ error: "Inpainting failed" }, { status: 500 });
    }
    console.log("[3/4] ✓ Inpainted:", inpaintedUrl);

    // ── Step 4: Diff compositing — restore original floor, keep furniture ────
    console.log("[4/4] Diff compositing (extracting furniture pixels)...");
    const compositeBuf = await compositeByDiff(imageBuffer, inpaintedUrl, W, H);

    const outputUrl = await fal.storage.upload(
      new File(
        [compositeBuf.buffer as ArrayBuffer],
        "staged-final.jpg",
        { type: "image/jpeg" }
      )
    );

    console.log("[4/4] ✓ Done:", outputUrl);
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
