"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";

const ROOM_TYPES = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Dining Room",
  "Office",
  "Bathroom",
] as const;

const STYLES = [
  "Organic Modern",
  "Contemporary Luxury",
  "Transitional Classic",
] as const;

type RoomType = (typeof ROOM_TYPES)[number];
type Style = (typeof STYLES)[number];

const STEPS = [
  "Uploading image...",
  "Staging room with apartment model...",
  "Refining masked furniture style if LoRA is provided...",
];

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState<RoomType>("Living Room");
  const [style, setStyle] = useState<Style>("Organic Modern");
  const [stagingScale, setStagingScale] = useState<number>(1.0);
  const [customLoraScale, setCustomLoraScale] = useState<number>(0.65);
  const [refineStrength, setRefineStrength] = useState<number>(0.25);
  const [loraUrl, setLoraUrl] = useState("");
  const [triggerPhrase, setTriggerPhrase] = useState("");
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreview, setMaskPreview] = useState<string | null>(null);
  
  // Final generated image URL from Fal AI
  const [stagedImageUrl, setStagedImageUrl] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setOriginalFile(file);
    setOriginalImage(URL.createObjectURL(file));
    setStagedImageUrl(null);
    setError(null);
  }, []);

  const handleMaskFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image mask file.");
      return;
    }
    setMaskFile(file);
    setMaskPreview(URL.createObjectURL(file));
    setStagedImageUrl(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (originalImage) {
        URL.revokeObjectURL(originalImage);
      }
    };
  }, [originalImage]);

  useEffect(() => {
    return () => {
      if (maskPreview) {
        URL.revokeObjectURL(maskPreview);
      }
    };
  }, [maskPreview]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleGenerate = async () => {
    if (!originalFile) return;
    if (loraUrl.trim() && !maskFile) {
      setError("Please upload a furniture mask before using a trained LoRA.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(STEPS[0]);
    setStagedImageUrl(null);

    try {
      const formData = new FormData();
      formData.append("image", originalFile);
      if (maskFile) {
        formData.append("mask", maskFile);
      }
      formData.append("roomType", roomType);
      formData.append("style", style);
      formData.append("loraUrl", loraUrl.trim());
      formData.append("triggerPhrase", triggerPhrase.trim());
      formData.append("stagingScale", stagingScale.toString());
      formData.append("customLoraScale", customLoraScale.toString());
      formData.append("refineStrength", refineStrength.toString());

      setProgress(STEPS[1]);

      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      if (data.imageUrl) {
        setStagedImageUrl(data.imageUrl);
        setProgress("");
      } else {
        setError("No image was generated. Please try again.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Generation failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!stagedImageUrl) return;
    try {
      const response = await fetch(stagedImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staged-${roomType.toLowerCase().replace(/\s+/g, "-")}-${style.toLowerCase().replace(/\s+/g, "-")}.jpg`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
    }
  };

  const loraNeedsMask = Boolean(loraUrl.trim()) && !maskFile;

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Virtual Staging AI <span className="text-yellow-500">Premium</span>
        </h1>
        <p className="mt-2 text-foreground/60 max-w-xl mx-auto">
          Preserve the original room with Fal apartment staging, then apply your trained luxury furniture style only inside a mask.
        </p>
      </header>

      {/* Upload Area */}
      <section className="mb-8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl cursor-pointer
            transition-colors duration-200 text-center
            ${
              dragActive
                ? "border-blue-500 bg-blue-500/5"
                : "border-foreground/20 hover:border-foreground/40"
            }
            ${originalImage ? "p-4" : "p-12 sm:p-16"}
          `}
        >
          {originalImage ? (
            <div className="relative w-full aspect-video">
              <Image
                src={originalImage}
                alt="Uploaded room"
                fill
                className="object-contain rounded-lg"
                unoptimized
              />
            </div>
          ) : (
            <div className="space-y-3">
              <svg
                className="mx-auto h-12 w-12 text-foreground/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-foreground/60 text-sm">
                Drag & drop your room photo here, or click to browse
              </p>
              <p className="text-foreground/40 text-xs">
                Supports JPG, PNG, and WebP up to 20MB. Processing runs on Fal.
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />
        </div>
        {originalImage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOriginalImage(null);
              setOriginalFile(null);
              setStagedImageUrl(null);
            }}
            className="mt-2 text-sm text-foreground/50 hover:text-foreground transition-colors"
          >
            Remove image
          </button>
        )}
      </section>

      {/* Options */}
      <section className="mb-8 space-y-6">
        <div className="space-y-4 rounded-xl border border-foreground/10 bg-foreground/5 p-4">
          <div>
            <label
              htmlFor="lora-url"
              className="block text-sm font-medium mb-2 text-foreground/70"
            >
              Trained LoRA URL <span className="text-foreground/40">(optional)</span>
            </label>
            <input
              id="lora-url"
              type="url"
              value={loraUrl}
              onChange={(e) => setLoraUrl(e.target.value)}
              placeholder="https://.../diffusers_lora_file.safetensors"
              className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/50"
            />
            <p className="mt-2 text-xs text-foreground/45">
              Leave empty to use only Fal apartment-staging. Add a LoRA URL only when you also provide a furniture mask.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium mb-2 text-foreground/70">
              Furniture Mask <span className="text-foreground/40">(required for LoRA)</span>
            </h2>
            <button
              type="button"
              onClick={() => maskInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-foreground/20 bg-background px-3 py-3 text-sm text-foreground/60 transition-colors hover:border-foreground/40"
            >
              {maskFile ? maskFile.name : "Upload mask image: white = furniture editable, black = locked room"}
            </button>
            <input
              ref={maskInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleMaskFile(file);
              }}
              className="hidden"
            />
            {maskPreview && (
              <div className="mt-3 relative w-full aspect-video rounded-lg overflow-hidden border border-foreground/10 bg-background">
                <Image
                  src={maskPreview}
                  alt="Furniture mask preview"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
            {maskFile && (
              <button
                type="button"
                onClick={() => {
                  setMaskFile(null);
                  setMaskPreview(null);
                  setStagedImageUrl(null);
                }}
                className="mt-2 text-xs text-foreground/50 hover:text-foreground transition-colors"
              >
                Remove mask
              </button>
            )}
            <p className="mt-2 text-xs text-foreground/45">
              The LoRA refine pass is restricted to this mask so walls, floors, windows, ceiling, and proportions stay locked.
            </p>
          </div>

          <div>
            <label
              htmlFor="trigger-phrase"
              className="block text-sm font-medium mb-2 text-foreground/70"
            >
              Trigger Phrase
            </label>
            <input
              id="trigger-phrase"
              type="text"
              value={triggerPhrase}
              onChange={(e) => setTriggerPhrase(e.target.value)}
              placeholder="Example: mybrand luxury staging"
              className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/50"
            />
            <p className="mt-2 text-xs text-foreground/45">
              Use the same unique phrase you used in the training captions when LoRA refine is enabled.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-3 text-foreground/70">
            Room Type
          </h2>
          <div className="flex flex-wrap gap-2">
            {ROOM_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setRoomType(type)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${
                    roomType === type
                      ? "bg-foreground text-background"
                      : "bg-foreground/5 hover:bg-foreground/10 text-foreground/70"
                  }
                `}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-3 text-foreground/70">
            Style
          </h2>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${
                    style === s
                      ? "bg-foreground text-background"
                      : "bg-foreground/5 hover:bg-foreground/10 text-foreground/70"
                  }
                `}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-medium text-foreground/70">
              Apartment Staging Strength
            </h2>
            <span className="text-sm font-medium text-foreground/50">
              {stagingScale.toFixed(2)}x
            </span>
          </div>
          <div className="space-y-2">
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={stagingScale}
              onChange={(e) => setStagingScale(parseFloat(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-xs text-foreground/40 px-1">
              <span>0.5x (Light staging)</span>
              <span>1.0x (Balanced)</span>
              <span>1.5x (Fuller staging)</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-medium text-foreground/70">
              Custom LoRA Style Strength
            </h2>
            <span className="text-sm font-medium text-foreground/50">
              {customLoraScale.toFixed(2)}x
            </span>
          </div>
          <div className="space-y-2">
            <input
              type="range"
              min="0.2"
              max="1.2"
              step="0.05"
              value={customLoraScale}
              onChange={(e) => setCustomLoraScale(parseFloat(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-xs text-foreground/40 px-1">
              <span>0.2x (Subtle)</span>
              <span>0.65x (Recommended)</span>
              <span>1.2x (Strong)</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-medium text-foreground/70">
              LoRA Refine Strength
            </h2>
            <span className="text-sm font-medium text-foreground/50">
              {refineStrength.toFixed(2)}
            </span>
          </div>
          <div className="space-y-2">
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={refineStrength}
              onChange={(e) => setRefineStrength(parseFloat(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-xs text-foreground/40 px-1">
              <span>0.05 (Safer)</span>
              <span>0.25 (Recommended)</span>
              <span>0.5 (Riskier)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Generate Button */}
      <section className="mb-10">
        <button
          onClick={handleGenerate}
          disabled={!originalFile || loraNeedsMask || loading}
          className={`
            w-full py-4 rounded-xl text-lg font-semibold transition-all
            ${
              !originalFile || loraNeedsMask || loading
                ? "bg-foreground/10 text-foreground/30 cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90 active:scale-[0.99] shadow-xl"
            }
          `}
        >
          {loading ? progress || "Processing..." : "Generate Premium Staging"}
        </button>
        {error && (
          <p className="mt-3 text-red-500 text-sm text-center">{error}</p>
        )}
      </section>

      {/* Results */}
      {stagedImageUrl && originalImage && (
        <section className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Staged Result</h2>
            <button
              onClick={handleDownload}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Download High-Res
            </button>
          </div>

          <div className="p-6 bg-foreground/5 rounded-2xl border border-foreground/10">
            <div className="relative w-full flex justify-center">
              <Image
                src={stagedImageUrl}
                alt="Staged result"
                width={1600}
                height={1000}
                unoptimized
                className="w-full h-auto max-h-[60vh] object-contain rounded-xl shadow-lg border border-foreground/10"
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
