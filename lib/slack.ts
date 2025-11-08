import { WebClient } from "@slack/web-api";

type SlackConfigKeys =
  | "SLACK_APP_ID"
  | "SLACK_CLIENT_ID"
  | "SLACK_CLIENT_SECRET"
  | "SLACK_SIGNING_SECRET"
  | "SLACK_BOT_TOKEN";

const slackConfigCache: Partial<Record<SlackConfigKeys, string>> = {};
let webClient: WebClient | null = null;

function getRequiredEnv(key: SlackConfigKeys): string {
  if (slackConfigCache[key]) {
    return slackConfigCache[key]!;
  }

  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  slackConfigCache[key] = value;
  return value;
}

export function getSlackClient(): WebClient {
  if (!webClient) {
    const token = getRequiredEnv("SLACK_BOT_TOKEN");
    webClient = new WebClient(token);
  }

  return webClient;
}

export function getSlackSigningSecret(): string {
  return getRequiredEnv("SLACK_SIGNING_SECRET");
}

export function getSlackOAuthConfig() {
  return {
    appId: getRequiredEnv("SLACK_APP_ID"),
    clientId: getRequiredEnv("SLACK_CLIENT_ID"),
    clientSecret: getRequiredEnv("SLACK_CLIENT_SECRET"),
  };
}

