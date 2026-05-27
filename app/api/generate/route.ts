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
//
// When style_rh LoRA is trained, paste the fal.media URL here.
// Everything else stays the same — the LoRA slot is already wired in.
//
const STYLE_RH_LORA_URL = ""; // ← trained LoRA URL goes here
const STYLE_RH_LORA_SCALE = 0.8;

// ─── Prompt System ────────────────────────────────────────────────────────────
//
// After LoRA training, the prompt simplifies to:
//   "luxury staged interior, luxury_rh_style"
//
// Until then, room-specific prompts guide the base model.
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
      "linen-cushioned counter stools with brushed brass legs at island, " +
      "brushed brass pendant lights above island, " +
      "white ceramic herb pots with fresh herbs on countertop, curated stoneware on open shelves",
    Minimalist:
      "minimal white upholstered counter stools at island, " +
      "single orchid in white ceramic pot on countertop, brushed metal pendant lights above island",
    Scandinavian:
      "light oak counter stools at island, ceramic bowls on countertop, " +
      "fresh herbs in terracotta pots, rattan pendant lights above island",
    Industrial:
      "black metal counter stools at island, concrete-effect ceramic objects on counter, " +
      "Edison pendant lights above island",
    "Mid-Century Modern":
      "walnut-finished counter stools at island, warm brass pendant lights above island, " +
      "ceramic canisters on countertop",
    Bohemian:
      "rattan counter stools at island, terracotta herb pots on countertop, " +
      "macramé pendant lights above island, trailing pothos on open shelf",
  },
  Bedroom: {
    Modern:
      "upholstered platform bed in warm ivory linen, matching nightstands with sculptural table lamps, " +
      "low white oak dresser, accent armchair in ivory boucle, cashmere throw",
    Minimalist:
      "low-profile platform bed in white linen, single sculptural table lamp on nightstand, " +
      "wabi-sabi ceramic object, clean negative space",
    Scandinavian:
      "white oak platform bed with linen bedding, sheepskin throw, " +
      "rattan pendant bedside lamp, textured wool runner at foot of bed",
    Industrial:
      "upholstered bed in charcoal linen, blackened steel nightstands, cognac leather bench at foot",
    "Mid-Century Modern":
      "walnut platform bed frame, ceramic table lamps on walnut nightstands, low walnut dresser",
    Bohemian:
      "low rattan bed with layered linen bedding, macramé wall hanging, " +
      "trailing pothos, layered area rugs, brass table lamp",
  },
  "Dining Room": {
    Modern:
      "solid white oak dining table, upholstered dining chairs in warm linen, " +
      "sculptural brass chandelier, white oak sideboard, botanical centerpiece",
    Minimalist:
      "minimal slab dining table, simple linen upholstered chairs, single pendant light, ceramic vase",
    Scandinavian:
      "light ash dining table, white upholstered dining chairs, rattan chandelier, linen table runner",
    Industrial:
      "reclaimed oak dining table, black metal dining chairs, Edison pendant lights, concrete sideboard",
    "Mid-Century Modern":
      "walnut dining table, tulip-inspired chairs, warm brass chandelier, walnut credenza",
    Bohemian:
      "rustic wood dining table, rattan dining chairs, macramé pendant, mixed ceramic setting",
  },
  Office: {
    Modern:
      "executive white oak desk, leather task chair, floor-to-ceiling shelving with books, " +
      "sculptural brass lamp, potted fiddle leaf fig",
    Minimalist:
      "minimal floating desk, simple task chair, single plant, monochromatic objects",
    Scandinavian:
      "light oak desk, white task chair, open shelving with books and plants, pendant lamp",
    Industrial:
      "blackened steel and reclaimed wood desk, cognac leather task chair, Edison desk lamp",
    "Mid-Century Modern":
      "walnut executive desk, Eames task chair in cognac leather, warm amber desk lamp",
    Bohemian:
      "rattan and reclaimed wood desk, linen-cushioned chair, open shelving with plants",
  },
  Bathroom: {
    Modern:
      "freestanding oval soaking tub, brushed brass fixtures, rolled linen towels, potted orchid, candles",
    Minimalist:
      "freestanding minimal soaking tub, single orchid, clean ceramic accessories, folded linen towels",
    Scandinavian:
      "white freestanding tub, wooden bath mat, linen towels, eucalyptus branch",
    Industrial:
      "freestanding tub with matte black fixtures, concrete accessories, rolled towels in metal basket",
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

// ─── Floor Mask from Depth Map ────────────────────────────────────────────────
//
// Conservative masking strategy:
//   - Upper 55% = ALWAYS black (cabinets, appliances, upper walls, ceiling)
//   - Lower 45% + depth >= 90 = white (actual open floor area)
//   - Soft feather at boundary
//
// Depth alone is insufficient — wine fridges near the camera are also bright.
// Y-position guard ensures upper structural elements are never masked.
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
    const d = depthRaw[i];

    if (yRatio < 0.55) {
      // Upper 55% — always preserve (cabinets, appliances, upper walls, ceiling)
      maskRaw[i] = 0;
    } else if (d >= 90) {
      // Lower 45% + very bright depth = open floor → inpaint here
      maskRaw[i] = 255;
    } else if (d >= 70) {
      // Soft feather at floor boundary
      maskRaw[i] = Math.round(((d - 70) / 20) * 255);
    } else {
      // Lower walls / baseboards — preserve
      maskRaw[i] = 0;
    }
  }

  return sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Architecture: flux-general/inpainting + custom LoRA + depth mask
//
// Pipeline:
//   1. Upload original image
//   2. Depth map → conservative floor mask
//   3. Flux inpainting
//      - mask_url:  floor mask (walls/cabinets/ceiling = untouched)
//      - loras:     style_rh LoRA (plug in URL when trained)
//      - ControlNet depth: wired in, activate when LoRA is ready
//
// When STYLE_RH_LORA_URL is set:
//   - Remove room-specific prompts → simplify to "luxury staged interior, luxury_rh_style"
//   - Enable ControlNet depth for production-grade structure preservation
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
      return NextResponse.json({ error: "Depth map failed" }, { status: 500 });
    }

    const maskBuffer = await generateFloorMask(depthUrl, W, H);
    const maskUrl = await fal.storage.upload(
      new File([maskBuffer.buffer as ArrayBuffer], "floor-mask.png", {
        type: "image/png",
      })
    );
    console.log("[2/3] ✓ Floor mask ready");

    // ── Step 3: Inpainting + LoRA ────────────────────────────────────────────
    console.log("[3/3] Inpainting...");

    // Prompt: simplified to one line once LoRA is trained
    const hasLoRA = STYLE_RH_LORA_URL.length > 0;
    const roomPrompts = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const prompt = hasLoRA
      ? `luxury staged interior, luxury_rh_style. ${BASE_QUALITY}.`
      : `${roomPrompts[style] ?? roomPrompts["Modern"]}. ${BASE_QUALITY}.`;

    console.log(`[3/3] LoRA: ${hasLoRA ? "✓ active" : "not yet — using prompt"}`);

    const loraInput = hasLoRA
      ? [{ path: STYLE_RH_LORA_URL, scale: STYLE_RH_LORA_SCALE }]
      : [];

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt,
        num_inference_steps: 40,
        strength: 0.90,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: "jpeg",
        ...(loraInput.length > 0 && { loras: loraInput }),
        // ControlNet depth — enable for production with LoRA
        // controlnets: [{
        //   path: "Shakker-Labs/FLUX.1-dev-ControlNet-Depth",
        //   image_url: depthUrl,
        //   conditioning_scale: 0.7,
        // }],
      },
      logs: true,
    });

    const outputUrl = (result.data as InpaintingOutput).images?.[0]?.url;
    if (!outputUrl) {
      return NextResponse.json({ error: "Inpainting failed" }, { status: 500 });
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
