"use client";

import { useState, useCallback, useRef } from "react";
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
  "Modern",
  "Minimalist",
  "Scandinavian",
  "Industrial",
  "Mid-Century Modern",
  "Bohemian",
] as const;

type RoomType = (typeof ROOM_TYPES)[number];
type Style = (typeof STYLES)[number];

const STEPS = [
  "Uploading image...",
  "Analyzing room depth...",
  "Building staging mask...",
  "Rendering staged room...",
];

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState<RoomType>("Living Room");
  const [style, setStyle] = useState<Style>("Modern");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [depthUrl, setDepthUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setOriginalFile(file);
    setOriginalImage(URL.createObjectURL(file));
    setGeneratedImage(null);
    setError(null);
  }, []);

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

    setLoading(true);
    setError(null);
    setProgress(STEPS[0]);
    setGeneratedImage(null);
    setMaskUrl(null);
    setDepthUrl(null);

    try {
      const formData = new FormData();
      formData.append("image", originalFile);
      formData.append("roomType", roomType);
      formData.append("style", style);

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
        setGeneratedImage(data.imageUrl);
        if (data.maskUrl) setMaskUrl(data.maskUrl);
        if (data.depthUrl) setDepthUrl(data.depthUrl);
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
    if (!generatedImage) return;
    const response = await fetch(generatedImage);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staged-${roomType.toLowerCase().replace(/\s+/g, "-")}-${style.toLowerCase()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Virtual Staging AI
        </h1>
        <p className="mt-2 text-foreground/60">
          Upload an empty room photo and AI will auto-detect the floor and add
          furniture
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
                Supports JPG, PNG, WebP
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
              setGeneratedImage(null);
            }}
            className="mt-2 text-sm text-foreground/50 hover:text-foreground transition-colors"
          >
            Remove image
          </button>
        )}
      </section>

      {/* Options */}
      <section className="mb-8 space-y-6">
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
      </section>

      {/* Generate Button */}
      <section className="mb-10">
        <button
          onClick={handleGenerate}
          disabled={!originalFile || loading}
          className={`
            w-full py-3 rounded-xl text-base font-semibold transition-all
            ${
              !originalFile || loading
                ? "bg-foreground/10 text-foreground/30 cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90 active:scale-[0.99]"
            }
          `}
        >
          {loading ? progress || "Processing..." : "Generate Staged Room"}
        </button>
        {error && (
          <p className="mt-3 text-red-500 text-sm text-center">{error}</p>
        )}
      </section>

      {/* Results */}
      {generatedImage && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Result</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-foreground/50 mb-2">Before</p>
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-foreground/10">
                <Image
                  src={originalImage!}
                  alt="Original room"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground/50 mb-2">After</p>
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-foreground/10">
                <Image
                  src={generatedImage}
                  alt="Staged room"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* Debug: Depth map + Staging mask */}
          {(depthUrl || maskUrl) && (
            <details className="mt-6">
              <summary className="text-xs text-foreground/40 cursor-pointer hover:text-foreground/60 select-none">
                ▸ Debug: depth map &amp; staging mask
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {depthUrl && (
                  <div>
                    <p className="text-xs text-foreground/40 mb-1">Depth map</p>
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-foreground/10">
                      <Image src={depthUrl} alt="Depth map" fill className="object-contain" unoptimized />
                    </div>
                  </div>
                )}
                {maskUrl && (
                  <div>
                    <p className="text-xs text-foreground/40 mb-1">Staging mask</p>
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-foreground/10">
                      <Image src={maskUrl} alt="Staging mask" fill className="object-contain" unoptimized />
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

          <button
            onClick={handleDownload}
            className="mt-4 px-6 py-2 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-sm font-medium transition-colors"
          >
            Download Result
          </button>
        </section>
      )}
    </main>
  );
}
