const LOG_PREFIX = "[agent]";

type AgentLogLevel = "info" | "warn" | "error" | "debug";

interface AgentLogOptions {
  step?: string;
  details?: unknown;
  alwaysDetails?: boolean;
}

let manualDebugOverride: boolean | null = null;

function readEnvDebugFlag(): boolean {
  if (typeof process !== "undefined") {
    const raw =
      process.env.AGENT_DEBUG ?? process.env.NEXT_PUBLIC_AGENT_DEBUG ?? "";
    if (raw) {
      return raw.toLowerCase() === "true" || raw === "1";
    }
  }

  if (typeof window !== "undefined") {
    const browserFlag = (window as any).__AGENT_DEBUG__;
    if (typeof browserFlag === "boolean") {
      return browserFlag;
    }
  }

  return false;
}

export function setAgentDebugEnabled(enabled: boolean | null): void {
  manualDebugOverride = enabled;
}

export function isAgentDebugEnabled(): boolean {
  return manualDebugOverride ?? readEnvDebugFlag();
}

function buildPrefix(step?: string): string {
  return step ? `${LOG_PREFIX} [${step}]` : LOG_PREFIX;
}

function log(
  level: AgentLogLevel,
  message: string,
  options?: AgentLogOptions
): void {
  const prefix = buildPrefix(options?.step);
  const line = `${prefix} ${message}`.trim();

  const consoleFn =
    level === "warn"
      ? console.warn
      : level === "error"
      ? console.error
      : level === "debug" && console.debug
      ? console.debug
      : console.log;

  const shouldPrintDetails =
    options?.details !== undefined &&
    (level === "error" || level === "debug" || options.alwaysDetails === true || isAgentDebugEnabled());

  if (shouldPrintDetails) {
    consoleFn(line, options!.details);
  } else {
    consoleFn(line);
  }
}

export const agentLogger = {
  info(message: string, options?: AgentLogOptions) {
    log("info", message, options);
  },
  warn(message: string, options?: AgentLogOptions) {
    log("warn", message, options);
  },
  error(message: string, options?: AgentLogOptions) {
    log("error", message, options);
  },
  debug(message: string, options?: AgentLogOptions) {
    log("debug", message, options);
  },
  isDebugEnabled(): boolean {
    return isAgentDebugEnabled();
  },
};

export type { AgentLogOptions };

