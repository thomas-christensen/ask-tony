import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSlackClient, getSlackSigningSecret } from "@/lib/slack";
import { queryAgentStream } from "@/lib/agent-wrapper";
import { generateAnswerId } from "@/lib/answer-utils";
import { saveAnswer, type StoredAnswerPayload } from "@/lib/answer-store";
import type { PlanResult, WidgetResponse } from "@/lib/widget-schema";

interface SlackAuthorization {
  user_id: string;
}

interface SlackAppMentionEvent {
  type: "app_mention";
  text: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
}

interface SlackEventRequest {
  type: "url_verification" | "event_callback";
  token?: string;
  challenge?: string;
  event?: SlackAppMentionEvent;
  authorizations?: SlackAuthorization[];
  team_id?: string;
  api_app_id?: string;
}

function getBaseUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function stripBotMention(text: string, botUserId?: string): string {
  if (!text) return "";

  let sanitized = text;
  if (botUserId) {
    const botMentionRegex = new RegExp(`<@${botUserId}>`, "g");
    sanitized = sanitized.replace(botMentionRegex, "");
  }

  return sanitized.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function verifySlackSignature(request: NextRequest, rawBody: string): boolean {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    return false;
  }

  const fiveMinutes = 60 * 5;
  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) {
    return false;
  }

  if (Math.abs(Date.now() / 1000 - requestTime) > fiveMinutes) {
    return false;
  }

  const [version, hash] = signature.split("=");
  if (version !== "v0" || !hash) {
    return false;
  }

  const signingSecret = getSlackSigningSecret();
  const hmac = createHmac("sha256", signingSecret);
  const baseString = `v0:${timestamp}:${rawBody}`;
  const digest = hmac.update(baseString).digest("hex");

  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(hash, "hex");

  if (digestBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(digestBuffer, signatureBuffer);
}

async function handleAppMention(
  event: SlackAppMentionEvent,
  botUserId: string | undefined,
  baseUrl: string
) {
  const slackClient = getSlackClient();

  if (event.bot_id || event.subtype === "bot_message") {
    return;
  }

  const threadTs = event.thread_ts ?? event.ts;
  const sanitizedText = stripBotMention(event.text, botUserId);

  if (!sanitizedText) {
    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: "Hi there! Please include a question when mentioning me.",
    });
    return;
  }

  let reactionAdded = false;
  try {
    await slackClient.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: "brain",
    });
    reactionAdded = true;
  } catch (error) {
    console.error("Failed to add reaction to Slack message:", error);
  }

  try {
    let capturedPlan: PlanResult | null = null;
    let finalResponse: WidgetResponse | null = null;

    await queryAgentStream(sanitizedText, (update) => {
      if (update.type === "plan" && update.plan) {
        capturedPlan = update.plan as PlanResult;
      } else if (update.type === "complete" && update.response) {
        finalResponse = update.response;
      }
    });

    if (!finalResponse) {
      throw new Error("No response received from agent");
    }

    const answerPayload: StoredAnswerPayload = {
      query: sanitizedText,
      response: finalResponse,
      plan: capturedPlan,
    };

    const answerId = generateAnswerId();
    saveAnswer(answerId, answerPayload);
    const answerUrl = `${baseUrl}/answer/${answerId}`;

    const message = `Here's what I found for *${sanitizedText}*:\n${answerUrl}`;

    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: message,
    });

    if (reactionAdded) {
      try {
        await slackClient.reactions.remove({
          channel: event.channel,
          timestamp: event.ts,
          name: "brain",
        });
      } catch (error) {
        console.error("Failed to remove reaction from Slack message:", error);
      }
    }
  } catch (error) {
    console.error("Failed to process Slack mention:", error);

    const errorMessage = "Sorry, I couldn't generate an answer. Please try again.";

    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: errorMessage,
    });

    if (reactionAdded) {
      try {
        await slackClient.reactions.remove({
          channel: event.channel,
          timestamp: event.ts,
          name: "brain",
        });
      } catch (error) {
        console.error("Failed to remove reaction from Slack message:", error);
      }
    }
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: SlackEventRequest;
  try {
    payload = JSON.parse(rawBody) as SlackEventRequest;
  } catch (error) {
    console.error("Failed to parse Slack request body:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // For url_verification, respond immediately without signature check
  if (payload.type === "url_verification" && payload.challenge) {
    console.log("URL verification received, responding with challenge");
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Verify signature for all other requests
  if (!verifySlackSignature(request, rawBody)) {
    console.error("Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (payload.type === "event_callback" && payload.event?.type === "app_mention") {
    const botUserId = payload.authorizations?.[0]?.user_id;
    const baseUrl = getBaseUrl(request);

    handleAppMention(payload.event, botUserId, baseUrl).catch((error) => {
      console.error("Unhandled Slack event error:", error);
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unsupported event type" }, { status: 400 });
}

