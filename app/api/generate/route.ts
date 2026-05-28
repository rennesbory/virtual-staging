import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

type FalUploadResult = string | { url?: string };
type GenerationData = {
  images?: Array<{ url?: string }>;
  image?: { url?: string };
};

class ValidationError extends Error {}

function parseNumberInRange(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value !== "string" || value.trim() === "") return fallback;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`Value must be between ${min} and ${max}`);
  }

  return parsed;
}

function parseOptionalHttpUrl(
  value: FormDataEntryValue | null,
  fieldName: string
) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new ValidationError(`${fieldName} must be a valid http(s) URL`);
  }
}

function getGeneratedUrl(data: GenerationData) {
  return data.images?.[0]?.url || data.image?.url;
}

function buildBasePrompt(promptStyle: string) {
  return [
    promptStyle,
    "architectural photography",
    "8k resolution",
    "highly detailed interior design",
    "photorealistic",
    "cinematic lighting",
  ].join(", ");
}

function buildRefinePrompt(promptStyle: string, triggerPhrase?: string) {
  return [
    triggerPhrase,
    promptStyle,
    "generate luxury furniture, upholstery, decor, and lighting mood only inside the mask",
    "do not alter anything outside the mask",
    "preserve the exact room architecture, walls, floor, ceiling, windows, camera angle, proportions, and materials",
    "photorealistic real estate virtual staging",
  ]
    .filter(Boolean)
    .join(", ");
}

async function uploadImageFile(file: File, label: string) {
  if (!file.type.startsWith("image/")) {
    throw new ValidationError(`${label} must be an image`);
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ValidationError(`${label} must be 20MB or smaller`);
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const uploadResult = await fal.storage.upload(
    new File([imageBuffer], file.name, { type: file.type })
  );
  const imageUrl =
    typeof uploadResult === "string"
      ? uploadResult
      : (uploadResult as FalUploadResult).url;

  if (!imageUrl) {
    throw new Error(`${label} upload failed`);
  }

  return imageUrl;
}

// ─── Prompt System ────────────────────────────────────────────────────────────
const PROMPTS: Record<string, Record<string, string>> = {
  "Living Room": {
    "Organic Modern": "ivory boucle sofa, travertine coffee table, wabi-sabi minimal decor",
    "Contemporary Luxury": "black leather Minotti sofa, smoked glass coffee table, sleek minimal decor",
    "Transitional Classic": "tufted cream sofa, walnut coffee table, elegant minimal decor",
  },
  "Kitchen": {
    "Organic Modern": "light oak counter stools, handmade ceramic bowl",
    "Contemporary Luxury": "black metal counter stools, sleek minimal decor",
    "Transitional Classic": "upholstered counter stools with nailhead trim",
  },
  "Bedroom": {
    "Organic Modern": "low profile linen platform bed, warm oak nightstands",
    "Contemporary Luxury": "velvet channel tufted bed, dark wood nightstands, modern brass lamps",
    "Transitional Classic": "tall upholstered headboard, classic walnut nightstands, elegant table lamps",
  },
  "Dining Room": {
    "Organic Modern": "raw edge oak dining table, ivory boucle chairs",
    "Contemporary Luxury": "dark marble dining table, sleek black leather chairs",
    "Transitional Classic": "classic walnut dining table, upholstered dining chairs",
  },
  "Office": {
    "Organic Modern": "warm oak writing desk, linen task chair",
    "Contemporary Luxury": "dark smoked glass desk, black leather executive chair",
    "Transitional Classic": "classic walnut executive desk, tufted leather chair",
  },
  "Bathroom": {
    "Organic Modern": "rolled linen towels, handmade ceramic accessories",
    "Contemporary Luxury": "sleek black accessories, modern folded towels",
    "Transitional Classic": "polished nickel bathroom accessories, plush white towels",
  }
};

// ─── Route Handler ────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Upload original image
//   2. Stage the room with fal-ai/flux-2-lora-gallery/apartment-staging
//   3. Optionally apply trained LoRA only inside a furniture mask
//   4. Return generated image
//
export async function POST(req: NextRequest) {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json(
        { error: "FAL_KEY environment variable is not configured" },
        { status: 500 }
      );
    }

    fal.config({ credentials: falKey });

    const formData = await req.formData();
    const imageEntry = formData.get("image");
    const image = imageEntry instanceof File ? imageEntry : null;
    const maskEntry = formData.get("mask");
    const mask = maskEntry instanceof File ? maskEntry : null;
    const roomType = (formData.get("roomType") as string) || "Living Room";
    const style = (formData.get("style") as string) || "Organic Modern";
    const loraUrl = parseOptionalHttpUrl(formData.get("loraUrl"), "LoRA URL");
    const triggerPhrase = (
      formData.get("triggerPhrase") as string | null
    )?.trim();
    const stagingScale = parseNumberInRange(
      formData.get("stagingScale") ?? formData.get("loraScale"),
      1.0,
      0,
      2
    );
    const customLoraScale = parseNumberInRange(
      formData.get("customLoraScale"),
      0.65,
      0,
      2
    );
    const refineStrength = parseNumberInRange(
      formData.get("refineStrength") ?? formData.get("strength"),
      0.25,
      0.01,
      0.5
    );

    const roomPrompts = PROMPTS[roomType] ?? PROMPTS["Living Room"];
    const promptStyle = roomPrompts[style] ?? roomPrompts["Organic Modern"];
    const basePrompt = buildBasePrompt(promptStyle);
    const refinePrompt = buildRefinePrompt(promptStyle, triggerPhrase);

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (loraUrl && !mask) {
      return NextResponse.json(
        { error: "Furniture mask is required when using a trained LoRA" },
        { status: 400 }
      );
    }

    // ── Step 1: Upload ───────────────────────────────────────────────────────
    console.log("[1/3] Uploading...");
    const imageUrl = await uploadImageFile(image, "Room image");
    const maskUrl = mask ? await uploadImageFile(mask, "Furniture mask") : null;
    console.log(`[1/3] ✓ Uploaded to ${imageUrl}`);

    console.log("[2/3] Staging room...");
    const stagingResult = await fal.subscribe(
      "fal-ai/flux-2-lora-gallery/apartment-staging",
      {
        input: {
          image_urls: [imageUrl],
          prompt: basePrompt,
          lora_scale: stagingScale,
          num_images: 1,
          output_format: "png",
        },
        logs: true,
      }
    );

    const stagedUrl = getGeneratedUrl(stagingResult.data as GenerationData);
    if (!stagedUrl) {
      console.error("Fal staging response:", stagingResult.data);
      throw new Error("Staging failed");
    }
    console.log(`[2/3] ✓ Staged: ${stagedUrl}`);

    let finalUrl = stagedUrl;
    if (loraUrl && maskUrl) {
      console.log("[3/3] Applying masked trained LoRA furniture refine...");
      const refineResult = await fal.subscribe(
        "fal-ai/flux-lora/inpainting",
        {
          input: {
            image_url: stagedUrl,
            mask_url: maskUrl,
            prompt: refinePrompt,
            loras: [{ path: loraUrl, scale: customLoraScale }],
            strength: refineStrength,
            num_images: 1,
            output_format: "png",
          },
          logs: true,
        }
      );

      const refinedUrl = getGeneratedUrl(refineResult.data as GenerationData);
      if (!refinedUrl) {
        console.error("Fal refine response:", refineResult.data);
        throw new Error("LoRA style refine failed");
      }

      finalUrl = refinedUrl;
      console.log(`[3/3] ✓ Refined: ${finalUrl}`);
    }

    return NextResponse.json({ imageUrl: finalUrl, baseImageUrl: stagedUrl });

  } catch (err: unknown) {
    console.error("[Pipeline] Error:", err);
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

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
