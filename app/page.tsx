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

type RoomType = (typeof ROOM_TYPES)[number];

const STEPS = [
  "Uploading image...",
  "Analyzing space...",
  "Placing furniture...",
];

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState<RoomType>("Living Room");
  
  // Final generated image URL from Fal AI
  const [stagedImageUrl, setStagedImageUrl] = useState<string | null>(null);
  
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
    setStagedImageUrl(null);
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
    setStagedImageUrl(null);

    try {
      const formData = new FormData();
      formData.append("image", originalFile);
      formData.append("roomType", roomType);

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
      a.download = `staged-${roomType.toLowerCase().replace(/\s+/g, "-")}.jpg`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
    }
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Virtual Staging AI <span className="text-yellow-500">Premium</span>
        </h1>
        <p className="mt-2 text-foreground/60 max-w-xl mx-auto">
          Upload an empty or partially furnished room. Our luxury staging AI perfectly preserves the original floors and fixtures while seamlessly integrating high-end furniture.
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
                Supports High-Res JPG, PNG, WebP (Processed on Client GPU)
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
      </section>

      {/* Generate Button */}
      <section className="mb-10">
        <button
          onClick={handleGenerate}
          disabled={!originalFile || loading}
          className={`
            w-full py-4 rounded-xl text-lg font-semibold transition-all
            ${
              !originalFile || loading
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
              <img
                src={stagedImageUrl}
                alt="Staged result"
                className="w-full h-auto max-h-[60vh] object-contain rounded-xl shadow-lg border border-foreground/10"
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
