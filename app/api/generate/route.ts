import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

fal.config({
  credentials:
    process.env.FAL_KEY ??
    "f19fed75-6de0-4b9b-91a7-b635a7f164b1:3581123dbc2a693ebcfef9316a7547df",
});

// ─── Types ───────────────────────────────────────────────────────────────────

type DepthOutput = {
  image: { url: string; width: number; height: number };
};

type InpaintOutput = {
  images: { url: string; width: number; height: number }[];
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
    "single slab travertine coffee table, one refined arc floor lamp, " +
    "deliberate negative space, single large-format abstract canvas, " +
    "monochromatic neutral palette, wabi-sabi ceramic objects",

  Scandinavian:
    "light ash and white oak furniture, ivory bouclé lounge chairs, " +
    "sheepskin throw, handcrafted rattan pendant lamp, " +
    "linen curtains pooling on floor, potted Monstera and olive tree, " +
    "textured wool area rug in warm oat",

  Industrial:
    "deep charcoal velvet sofa, blackened steel and reclaimed oak coffee table, " +
    "antique brass Edison pendant lights, vintage cognac leather armchair, " +
    "oversized abstract oil painting, raw concrete and aged metal accents",

  "Mid-Century Modern":
    "walnut credenza and side tables, Eames-inspired lounge chair in cognac leather, " +
    "sculptural Saarinen tulip table, warm amber arc floor lamp, " +
    "geometric kilim area rug in burnt sienna, curated vinyl record collection",

  Bohemian:
    "low-slung rattan daybed with linen cushions, layered Moroccan rugs, " +
    "macramé wall installation, trailing pothos and bird of paradise, " +
    "hand-hammered brass side table, eclectic curated global artifacts",
};

const ROOM_PROMPTS: Record<string, string> = {
  "Living Room":
    "living room with large sectional sofa, statement coffee table, " +
    "layered area rugs, floor lamp, organic side tables, decorative objects, art",
  Bedroom:
    "bedroom with upholstered platform bed, linen bedding with texture, " +
    "nightstands with table lamps, low dresser, accent armchair",
  Kitchen:
    "kitchen with upholstered bar stools at island, " +
    "woven rattan pendant lights above island, " +
    "fresh herb pots on counter, curated ceramics and cutting boards displayed",
  "Dining Room":
    "dining room with solid wood dining table, fully upholstered dining chairs, " +
    "sculptural chandelier, credenza with art and objects, table centerpiece of botanicals",
  Office:
    "home office with large executive desk, " +
    "Eames-style task chair in leather, floor-to-ceiling shelving with curated books, " +
    "sculptural task lamp, framed architectural prints",
  Bathroom:
    "bathroom with freestanding soaking tub, stone vanity accessories, " +
    "rolled linen towels, architectural candles, potted orchid",
};

const BASE_QUALITY =
  "RH Restoration Hardware aesthetic, photorealistic luxury interior photography, " +
  "Architectural Digest editorial quality, 8K resolution, " +
  "soft diffused natural daylight from windows, warm ambient shadows with depth, " +
  "professional luxury real estate photography for 10 million dollar property";

const NEGATIVE_PROMPT =
  "IKEA furniture, cheap materials, plastic, laminate, " +
  "change floor material, replace flooring, alter floor color or texture, " +
  "change wall color, modify ceiling, redesign cabinets, alter windows or doors, " +
  "remodel, renovate, different architectural style, " +
  "cartoon, illustration, CGI render, watermark, text, distorted, blurry, " +
  "overexposed, flat lighting, harsh shadows, cluttered, busy";

// ─── Depth Map → Staging Mask ────────────────────────────────────────────────
//
// Midas depth map convention: bright = near camera, dark = far.
// In a room photo: floor (near) = bright, ceiling (far) = dark.
//
// Staging mask strategy:
//   • Top 22%  → BLACK  (ceiling — never touch)
//   • Mid zone → WHITE  (furniture placement zone, depth-guided)
//   • Edges    → soft   (smooth blend at mask boundary)
//
async function buildStagingMask(
  depthMapUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  const res = await fetch(depthMapUrl);
  const depthBuffer = Buffer.from(await res.arrayBuffer());

  // Resize depth to match original image exactly
  const { data, info } = await sharp(depthBuffer)
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const mask = Buffer.alloc(width * height);

  for (let i = 0; i < width * height; i++) {
    const y = Math.floor(i / width);
    const yRatio = y / height;
    const depthVal = data[i]; // 0–255

    // ① Ceiling band — always black
    if (yRatio < 0.22) {
      mask[i] = 0;
      continue;
    }

    // ② Staging zone: bright depth (near camera) = floor/furniture area
    //    Threshold 72 captures floor while leaving distant walls mostly black.
    if (depthVal >= 72) {
      // Fade-in at top of staging zone for smooth blending
      if (yRatio < 0.32) {
        mask[i] = Math.round(((yRatio - 0.22) / 0.10) * 255);
      } else {
        mask[i] = 255;
      }
    } else {
      mask[i] = 0;
    }
  }

  // Slight Gaussian blur on edges so inpainting blends seamlessly
  return sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(3)
    .png()
    .toBuffer();
}

// ─── Route Handler ────────────────────────────────────────────────────────────

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

    // ── Step 1: Upload + dimensions ──────────────────────────────────────────
    console.log("[1/4] Uploading image...");
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const { width: W = 1024, height: H = 768 } =
      await sharp(imageBuffer).metadata();

    const imageUrl = await fal.storage.upload(
      new File([imageBuffer], image.name, { type: image.type })
    );
    console.log(`[1/4] ✓ ${W}×${H}  →  ${imageUrl}`);

    // ── Step 2: Depth map ────────────────────────────────────────────────────
    console.log("[2/4] Generating depth map...");
    const depthResult = await fal.subscribe("fal-ai/imageutils/depth", {
      input: { image_url: imageUrl },
    });
    const depthUrl = (depthResult.data as DepthOutput).image.url;
    console.log("[2/4] ✓ Depth:", depthUrl);

    // ── Step 3: Staging mask from depth ─────────────────────────────────────
    console.log("[3/4] Building staging mask...");
    const maskBuf = await buildStagingMask(depthUrl, W, H);
    const maskUrl = await fal.storage.upload(
      new File([maskBuf.buffer as ArrayBuffer], "staging-mask.png", { type: "image/png" })
    );
    console.log("[3/4] ✓ Mask:", maskUrl);

    // ── Step 4: Flux Inpainting + Depth ControlNet ───────────────────────────
    //
    // mask_url  → only the staging zone is regenerated
    //             everything outside = pixel-perfect original
    // control_loras depth → model understands 3D structure of the space
    //             so perspective, lighting, and proportions stay coherent
    // strength 0.92 → strong furniture generation within the masked zone
    //
    console.log("[4/4] Rendering staged room...");

    const prompt =
      `Furnish this empty room. ${ROOM_PROMPTS[roomType] ?? ROOM_PROMPTS["Living Room"]}. ` +
      `${STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Modern"]}. ` +
      `${BASE_QUALITY}. ` +
      `Preserve all existing architectural surfaces: floor material, wall color, ceiling, cabinets, windows.`;

    const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
      input: {
        prompt,
        negative_prompt: NEGATIVE_PROMPT,
        image_url: imageUrl,
        mask_url: maskUrl,
        strength: 0.92,
        num_inference_steps: 35,
        guidance_scale: 4.0,
        num_images: 1,
        output_format: "jpeg",
        // Depth ControlNet: locks 3D spatial structure so the model
        // understands perspective, depth relationships, and lighting direction.
        // Prevents furniture from looking "pasted on" or wrong scale.
        control_loras: [
          {
            path: "jasperai/Flux.1-dev-Controlnet-Depth",
            control_image_url: depthUrl,    // pass pre-computed depth map
            preprocess: "None",             // already a depth map
            scale: 0.62,
          },
        ],
      },
      logs: true,
    });

    const out = result.data as InpaintOutput;
    if (out.images?.[0]?.url) {
      console.log("[4/4] ✓ Done:", out.images[0].url);
      return NextResponse.json({
        imageUrl: out.images[0].url,
        maskUrl,          // expose mask for debug overlay in UI
        depthUrl,         // expose depth map for debug overlay in UI
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
