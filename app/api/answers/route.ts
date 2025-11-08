import { NextRequest, NextResponse } from "next/server";
import { queryAgentStream } from "@/lib/agent-wrapper";
import type { WidgetResponse, PlanResult } from "@/lib/widget-schema";
import { generateAnswerId } from "@/lib/answer-utils";

type DataMode = "web-search" | "example-data";

interface AnswerPayload {
  query: string;
  response: WidgetResponse;
  plan: PlanResult | null;
  dataMode?: DataMode;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, model, dataMode }: { message?: unknown; model?: string; dataMode?: DataMode } = body ?? {};

    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Invalid or missing `message`" }, { status: 400 });
    }

    if (dataMode && dataMode !== "web-search" && dataMode !== "example-data") {
      return NextResponse.json({ error: "Invalid `dataMode`" }, { status: 400 });
    }

    let finalResponse: WidgetResponse | null = null;
    let capturedPlan: PlanResult | null = null;

    await queryAgentStream(
      message,
      (update) => {
        if (!update) return;

        if (update.type === "plan" && update.plan) {
          capturedPlan = update.plan;
        } else if (update.type === "complete" && update.response) {
          finalResponse = update.response;
        } else if (update.type === "error") {
          throw new Error(update.message || "Unknown agent error");
        }
      },
      model,
      dataMode
    );

    if (!finalResponse) {
      return NextResponse.json({ error: "Failed to generate answer" }, { status: 500 });
    }

    const answerId = generateAnswerId();
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const answerUrl = `${baseUrl}/answer/${answerId}`;

    const answerPayload: AnswerPayload = {
      query: message,
      response: finalResponse,
      plan: capturedPlan,
      ...(dataMode ? { dataMode } : {}),
    };

    return NextResponse.json(
      {
        answerId,
        answerUrl,
        answerPayload,
        note: "No server-side persistence; client must store answerPayload if needed.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error handling /api/answers request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


