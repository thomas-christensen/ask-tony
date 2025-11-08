import { NextRequest, NextResponse } from "next/server";
import { saveAnswer, type StoredAnswerPayload } from "@/lib/answer-store";
import { generateAnswerId } from "@/lib/answer-utils";

interface StoreRequestBody {
  payload?: {
    query?: unknown;
    response?: unknown;
    plan?: unknown;
    dataMode?: unknown;
  };
}

function isValidPayload(payload: any): payload is StoredAnswerPayload {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.query !== "string" || payload.query.trim().length === 0) return false;
  if (!payload.response || typeof payload.response !== "object") return false;

  if (payload.plan !== null && payload.plan !== undefined && typeof payload.plan !== "object") {
    return false;
  }

  if (
    payload.dataMode !== undefined &&
    payload.dataMode !== "web-search" &&
    payload.dataMode !== "example-data"
  ) {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StoreRequestBody;
    const payload = body.payload;

    if (!payload || !isValidPayload(payload)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const answerId = generateAnswerId();
    const record = saveAnswer(answerId, {
      query: payload.query,
      response: payload.response,
      plan: payload.plan ?? null,
      dataMode: payload.dataMode,
    });

    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const answerUrl = `${baseUrl}/answer/${answerId}`;

    return NextResponse.json(
      {
        answerId,
        answerUrl,
        answer: record,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error storing answer payload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

