import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import type { AnswerPresentation } from "@/lib/answer-presentation";
import {
  ANSWER_OG_CONTENT_TYPE,
  ANSWER_OG_IMAGE_SIZE,
  renderAnswerPreviewFallback,
  renderAnswerPreviewImage,
} from "@/lib/opengraph.tsx";
import { getSlackSigningSecret } from "@/lib/slack";

export const runtime = "nodejs";
export const size = ANSWER_OG_IMAGE_SIZE;
export const contentType = ANSWER_OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

interface SlackPreviewPayload {
  presentation: AnswerPresentation;
  seed?: string;
}

function base64UrlToBase64(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return base64;
}

function decodePayload(payload: string): string {
  const buffer = Buffer.from(base64UrlToBase64(payload), "base64");
  return buffer.toString("utf8");
}

function verifySignature(payload: string, signature: string): boolean {
  const secret = getSlackSigningSecret();
  const expected = createHmac("sha256", secret).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(base64UrlToBase64(signature), "base64");
  } catch {
    return false;
  }

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function isAnswerPresentation(value: unknown): value is AnswerPresentation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const { title, description, highlights } = candidate;

  if (typeof title !== "string" || typeof description !== "string") {
    return false;
  }

  if (!Array.isArray(highlights) || highlights.some((item) => typeof item !== "string")) {
    return false;
  }

  const optionalStringFields: Array<[keyof AnswerPresentation, unknown]> = [
    ["metricLabel", candidate.metricLabel],
    ["metricValue", candidate.metricValue],
    ["metricSubtitle", candidate.metricSubtitle],
  ];

  return optionalStringFields.every(([_, value]) => value === undefined || typeof value === "string");
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const payloadParam = url.searchParams.get("payload");
  const signatureParam = url.searchParams.get("sig");

  if (!payloadParam || !signatureParam) {
    return renderAnswerPreviewFallback("Preview unavailable");
  }

  if (!verifySignature(payloadParam, signatureParam)) {
    return renderAnswerPreviewFallback("Preview unavailable");
  }

  try {
    const raw = decodePayload(payloadParam);
    const parsed = JSON.parse(raw) as SlackPreviewPayload;

    if (!isAnswerPresentation(parsed.presentation)) {
      return renderAnswerPreviewFallback("Preview unavailable");
    }

    return renderAnswerPreviewImage(parsed.presentation, { seed: parsed.seed });
  } catch (error) {
    console.error("Failed to render Slack preview image:", error);
    return renderAnswerPreviewFallback("Preview unavailable");
  }
}

