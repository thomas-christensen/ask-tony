import { getAnswer, type StoredAnswerRecord } from "@/lib/answer-store";
import { buildAnswerPresentation } from "@/lib/answer-presentation";
import {
  ANSWER_OG_CONTENT_TYPE,
  ANSWER_OG_IMAGE_SIZE,
  renderAnswerPreviewFallback,
  renderAnswerPreviewImage,
} from "@/lib/opengraph.tsx";

export const runtime = "nodejs";
export const alt = "Generative answer preview";
export const size = ANSWER_OG_IMAGE_SIZE;
export const contentType = ANSWER_OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

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
      return renderAnswerPreviewFallback("Answer preview not available");
    }

    const presentation = buildAnswerPresentation(answer);
    return renderAnswerPreviewImage(presentation, { seed: answer.id });
  } catch (error) {
    console.error("[OG] Failed to render OG image:", error);
    return renderAnswerPreviewFallback("Answer preview temporarily unavailable");
  }
}

