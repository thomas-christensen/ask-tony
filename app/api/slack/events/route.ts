import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { KnownBlock, MrkdwnElement } from "@slack/web-api";
import { getSlackClient, getSlackSigningSecret } from "@/lib/slack";
import { queryAgentStream } from "@/lib/agent-wrapper";
import { generateAnswerId } from "@/lib/answer-utils";
import {
  saveAnswer,
  type StoredAnswerPayload,
} from "@/lib/answer-store";
import { buildAnswerPresentation, type AnswerPresentation } from "@/lib/answer-presentation";
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

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizePlainText(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim();
}

function escapeSlackMarkdown(text: string): string {
  return escapeSlackText(text).replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/~/g, "\\~");
}

function formatHighlights(highlights: string[], metricLine?: string): string | null {
  if (highlights.length === 0) return null;

  const uniqueHighlights: string[] = [];
  const seen = new Set<string>();
  const normalizedMetric = metricLine?.toLowerCase();

  for (const highlight of highlights) {
    const normalized = highlight.toLowerCase();
    if (normalizedMetric && normalized === normalizedMetric) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueHighlights.push(highlight);
    if (uniqueHighlights.length === 3) break;
  }

  if (uniqueHighlights.length === 0) return null;

  const formatted = uniqueHighlights
    .map((highlight) => `- ${escapeSlackMarkdown(truncate(highlight, 150))}`)
    .join("\n");
  return formatted.length > 0 ? formatted : null;
}

function createSlackBlocks({
  presentation,
  answerUrl,
}: {
  presentation: AnswerPresentation;
  answerUrl: string;
}): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: truncate(escapeSlackText(presentation.title), 150),
      emoji: true,
    },
  });

  const metricLabel = presentation.metricLabel
    ? escapeSlackMarkdown(truncate(presentation.metricLabel, 80))
    : null;
  const metricValue = presentation.metricValue
    ? escapeSlackMarkdown(truncate(presentation.metricValue, 120))
    : null;
  const metricSubtitle = presentation.metricSubtitle
    ? escapeSlackMarkdown(truncate(presentation.metricSubtitle, 120))
    : null;

  if (metricLabel && metricValue) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${metricLabel}*\n*${metricValue}*${metricSubtitle ? `\n_${metricSubtitle}_` : ""}`,
      },
    });
  }

  const description = presentation.description?.trim();
  if (description) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: escapeSlackMarkdown(truncate(description, 3000)),
      },
    });
  }

  const metricLine = metricLabel && metricValue ? `${metricLabel}: ${metricValue}` : undefined;
  const highlights = formatHighlights(presentation.highlights, metricLine);
  if (highlights) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Highlights*\n${highlights}`,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View more",
          emoji: true,
        },
        url: answerUrl,
      },
    ],
  });

  return blocks;
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
  let placeholderTs: string | undefined;
  
  // Try to add a reaction first
  try {
    await slackClient.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: "brain",
    });
    reactionAdded = true;
  } catch (error) {
    console.error("Failed to add reaction to Slack message (missing reactions:write scope?):", error);
    
    // Fall back to posting a message if reaction fails
    try {
      const placeholder = await slackClient.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "Working on it...",
      });
      placeholderTs = placeholder.ts;
    } catch (msgError) {
      console.error("Failed to post placeholder message:", msgError);
    }
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
    const storedAnswer = saveAnswer(answerId, answerPayload);
    const answerUrl = `${baseUrl}/answer/${answerId}`;
    
    console.log("Building presentation for answer:", answerId);
    const presentation = buildAnswerPresentation(storedAnswer);
    console.log("Presentation built:", { title: presentation.title, description: presentation.description });
    
    const blocks = createSlackBlocks({
      presentation,
      answerUrl,
    });
    const fallbackTitle = truncate(sanitizePlainText(presentation.title), 120);
    const fallbackText = `${fallbackTitle} • ${answerUrl}`;

    const messagePayload = {
      channel: event.channel,
      text: fallbackText,
      blocks,
    } as const;

    // Update placeholder message or post new message
    if (placeholderTs) {
      await slackClient.chat.update({
        ...messagePayload,
        ts: placeholderTs,
      });
    } else {
      await slackClient.chat.postMessage({
        ...messagePayload,
        thread_ts: threadTs,
        unfurl_links: false,
        unfurl_media: false,
      });
    }

    // Remove reaction if it was added
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
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");

    const errorMessage = "Sorry, I couldn't generate an answer. Please try again.";

    // Update placeholder or post error message
    if (placeholderTs) {
      await slackClient.chat.update({
        channel: event.channel,
        ts: placeholderTs,
        text: errorMessage,
      });
    } else {
      await slackClient.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: errorMessage,
      });
    }

    // Remove reaction if it was added
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

