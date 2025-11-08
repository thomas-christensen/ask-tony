import { ImageResponse } from "next/og";
import { getAnswer, type StoredAnswerRecord } from "@/lib/answer-store";
import { buildAnswerPresentation } from "@/lib/answer-presentation";

export const runtime = "nodejs";
export const alt = "Generative answer preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const gradient = [
  "linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #38bdf8 100%)",
  "linear-gradient(135deg, #111827 0%, #7c3aed 50%, #ec4899 100%)",
  "linear-gradient(135deg, #0f172a 0%, #0ea5e9 50%, #22c55e 100%)",
];

function pickBackground(id: string) {
  const index = Math.abs(hashString(id)) % gradient.length;
  return gradient[index];
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function resolveAnswer(id: string): Promise<StoredAnswerRecord | null> {
  const localAnswer = getAnswer(id);
  if (localAnswer) {
    return localAnswer;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/answers/${id}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { answer: StoredAnswerRecord };
    return data.answer ?? null;
  } catch (error) {
    console.error("Failed to fetch answer for OG image:", error);
    return null;
  }
}

function renderFallbackImage(message: string) {
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
    size
  );
}

export default async function Image({
  params,
}: {
  params: { id: string };
}) {
  console.log("[OG] Generating answer OG image for id:", params.id);
  try {
    const answer = await resolveAnswer(params.id);

    if (!answer) {
      console.warn("[OG] No answer found for id:", params.id);
      return renderFallbackImage("Answer preview not available");
    }

    const presentation = buildAnswerPresentation(answer);
    const background = pickBackground(answer.id);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "80px",
            background,
            color: "#f8fafc",
            fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
            letterSpacing: -0.4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: 0.85,
              fontSize: 28,
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: "rgba(15, 23, 42, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              UI
            </div>
            Generative Answer
          </div>

          <div
            style={{
              marginTop: 48,
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: 760,
              wordBreak: "break-word",
            }}
          >
            {presentation.title}
          </div>

          <div
            style={{
              marginTop: 24,
              fontSize: 28,
              lineHeight: 1.4,
              maxWidth: 720,
              opacity: 0.9,
            }}
          >
            {presentation.description}
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                fontSize: 24,
                opacity: 0.95,
              }}
            >
              {presentation.highlights.slice(0, 3).map((highlight, index) => (
                <div
                  key={`${presentation.title}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: "rgba(248, 250, 252, 0.8)",
                  }}
                />
                <span>{highlight}</span>
              </div>
            ))}
          </div>

          {presentation.metricLabel && presentation.metricValue && (
            <div
              style={{
                borderRadius: 28,
                padding: "20px 32px",
                backgroundColor: "rgba(15, 23, 42, 0.35)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 220,
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  opacity: 0.8,
                  textTransform: "uppercase",
                  letterSpacing: 4,
                }}
              >
                {presentation.metricLabel}
              </span>
              <span
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: -1,
                }}
              >
                {presentation.metricValue}
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
  } catch (error) {
    console.error("[OG] Failed to render OG image:", error);
    return renderFallbackImage("Answer preview temporarily unavailable");
  }
}

