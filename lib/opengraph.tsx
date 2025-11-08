import { ImageResponse } from "next/og";
import type { AnswerPresentation } from "@/lib/answer-presentation";

export const ANSWER_OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const ANSWER_OG_CONTENT_TYPE = "image/png" as const;

const GRADIENT_BACKGROUNDS = [
  "linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #38bdf8 100%)",
  "linear-gradient(135deg, #111827 0%, #7c3aed 50%, #ec4899 100%)",
  "linear-gradient(135deg, #0f172a 0%, #0ea5e9 50%, #22c55e 100%)",
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function pickBackground(key: string): (typeof GRADIENT_BACKGROUNDS)[number] {
  const index = Math.abs(hashString(key)) % GRADIENT_BACKGROUNDS.length;
  return GRADIENT_BACKGROUNDS[index];
}

export async function renderAnswerPreviewImage(
  presentation: AnswerPresentation,
  options: { seed?: string } = {}
): Promise<Response> {
  // For demo purposes, serve static preview image
  const fs = await import("fs/promises");
  const path = await import("path");
  
  try {
    const imagePath = path.join(process.cwd(), "public", "demo-preview.png");
    const imageBuffer = await fs.readFile(imagePath);
    
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": ANSWER_OG_CONTENT_TYPE,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to load demo preview image:", error);
    // Fall back to generated fallback
    return renderAnswerPreviewFallback("Demo preview unavailable");
  }
}

export function renderAnswerPreviewFallback(message: string): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#e2e8f0",
          fontSize: 48,
          fontWeight: 600,
          letterSpacing: -0.5,
          textAlign: "center",
          padding: "40px",
        }}
      >
        {message}
      </div>
    ),
    ANSWER_OG_IMAGE_SIZE
  );
}

