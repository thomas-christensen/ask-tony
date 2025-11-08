import { exec, spawn } from "child_process";
import { promisify } from "util";
import { agentLogger } from "./agent-logger";

const execAsync = promisify(exec);

export interface CursorOptions {
  /** The prompt to send to the cursor agent */
  prompt: string;
  /** System prompt to define AI behavior */
  systemPrompt?: string;
  /** API key for authentication (defaults to CURSOR_API_KEY env var) */
  apiKey?: string;
  /** Output format for responses */
  outputFormat?: "json" | "stream-json";
  /** Force allow commands unless explicitly denied */
  force?: boolean;
  /** Model to use (e.g., gpt-5, sonnet-4, sonnet-4-thinking) */
  model?: string;
  /** Resume a specific chat ID */
  resumeChatId?: string;
  /** Enable debug logging for stdio output */
  debug?: boolean;
}

export interface CursorStreamEvent {
  type: "system" | "user" | "assistant" | "tool_call" | "result" | "thinking";
  subtype?: string;
  session_id?: string;
  message?: {
    content: Array<{ text: string }>;
  };
  tool_call?: any;
  model?: string;
  duration_ms?: number;
}

export interface CursorResult {
  success: boolean;
  output: string;
  error?: string;
  duration_ms?: number;
}

export interface CursorStreamResult {
  success: boolean;
  events: CursorStreamEvent[];
  error?: string;
  finalText: string;
  duration_ms?: number;
}

class CursorAgent {
  private defaultOptions: Partial<CursorOptions> = {
    outputFormat: "stream-json",
    force: true,
  };

  /**
   * Check if cursor-agent CLI is available
   */
  private async checkCursorAgentAvailable(): Promise<boolean> {
    agentLogger.info("Checking cursor-agent CLI availability", {
      step: "cursor-cli"
    });
    agentLogger.debug("cursor-agent env snapshot", {
      step: "cursor-cli",
      details: { hasApiKey: !!process.env.CURSOR_API_KEY }
    });
    
    try {
      const { stdout } = await execAsync("which cursor-agent");
      if (stdout.trim().length > 0) {
        agentLogger.info("cursor-agent CLI found in PATH", {
          step: "cursor-cli",
          details: stdout.trim()
        });
        return true;
      }
    } catch (e) {
      // Not in PATH
    }
    
    // Try adding common locations to PATH
    const locations = ["$HOME/.local/bin", "$HOME/.cursor/bin", "/usr/local/bin"];
    for (const loc of locations) {
      try {
        await execAsync(`test -x ${loc}/cursor-agent`);
        const binDir = loc.replace("$HOME", process.env.HOME || "~");
        process.env.PATH = `${binDir}:${process.env.PATH}`;
        agentLogger.info("cursor-agent CLI found in fallback location", {
          step: "cursor-cli",
          details: loc
        });
        return true;
      } catch (e) {
        // Try next location
      }
    }
    
    agentLogger.error("cursor-agent CLI not found. Please install it.", {
      step: "cursor-cli"
    });
    return false;
  }

  /**
   * Generate with streaming support and real-time event callbacks
   */
  async generateStreamWithCallback(
    options: CursorOptions,
    onEvent?: (event: CursorStreamEvent) => void
  ): Promise<CursorStreamResult> {
    const opts = {
      ...this.defaultOptions,
      ...options,
      outputFormat: "stream-json" as const,
    };

    // Check if cursor-agent is available
    const isAvailable = await this.checkCursorAgentAvailable();
    if (!isAvailable) {
      const errorMsg = "cursor-agent CLI not found. Please install it: curl -fsS https://cursor.com/install | bash";
      agentLogger.error(errorMsg, { step: "cursor-cli" });
      return {
        success: false,
        events: [],
        finalText: "",
        error: errorMsg,
        duration_ms: 0,
      };
    }

    return new Promise((resolve) => {
      const events: CursorStreamEvent[] = [];
      let finalText = "";
      let accumulatedText = "";
      let error: string | undefined;
      let resolved = false; // Track if we've already resolved
      const startTime = Date.now();

      const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY;
      const env: NodeJS.ProcessEnv = {
        ...(process.env as NodeJS.ProcessEnv),
        ...(apiKey ? { CURSOR_API_KEY: apiKey } : {}),
      };

      const command = this.buildCommand(opts);
      
      agentLogger.info("Starting cursor-agent stream", {
        step: "cursor-run",
        details: { model: opts.model, force: opts.force }
      });
      if (agentLogger.isDebugEnabled()) {
        const promptPreview =
          opts.prompt.slice(0, 100) + (opts.prompt.length > 100 ? "..." : "");
        const systemPromptPreview = opts.systemPrompt
          ? opts.systemPrompt.slice(0, 100) + "..."
          : "none";
        agentLogger.debug("cursor-agent invocation details", {
          step: "cursor-run",
          details: {
            outputFormat: opts.outputFormat,
            systemPromptPreview,
            promptPreview,
            commandLength: command.length
          }
        });
      }

      const child = spawn("sh", ["-c", command], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        agentLogger.warn("cursor-agent stream timed out after 5 minutes", {
          step: "cursor-run"
        });
        try {
          child.kill("SIGTERM");
        } catch {}
        resolve({
          success: false,
          events,
          finalText: finalText || accumulatedText,
          error: "Process timed out after 5 minutes",
          duration_ms: Date.now() - startTime,
        });
      }, 5 * 60 * 1000);

      child.on("error", (err: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        agentLogger.error("cursor-agent process error", {
          step: "cursor-run",
          details: err
        });
        resolve({
          success: false,
          events: [],
          finalText: "",
          error: `Child process error: ${err.message}`,
          duration_ms: Date.now() - startTime,
        });
      });

      child.stdout.on("data", (data: Buffer) => {
        const dataStr = data.toString();
        const lines = dataStr.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const event: CursorStreamEvent = JSON.parse(line);
            events.push(event);
            
            // Debug: log event types
            if (agentLogger.isDebugEnabled() && event.type !== "assistant") {
              agentLogger.debug(`Received event: ${event.type}`, {
                step: "cursor-run",
                details: event.subtype || null
              });
            }

            if (onEvent) {
              onEvent(event);
            }

            if (event.type === "assistant" && event.message?.content?.[0]?.text) {
              const textChunk = event.message.content[0].text;
              accumulatedText += textChunk;
              // Debug: log first few chunks
              if (agentLogger.isDebugEnabled() && accumulatedText.length < 500) {
                agentLogger.debug("Received text chunk", {
                  step: "cursor-run",
                  details: textChunk.slice(0, 100)
                });
              }
            }

            if (event.type === "result") {
              if (resolved) return;
              resolved = true;
              finalText = accumulatedText;
              clearTimeout(timeout);
              
              // Debug: log what we got
              const duration = event.duration_ms || Date.now() - startTime;
              agentLogger.info("cursor-agent stream complete", {
                step: "cursor-run",
                details: { textLength: finalText.length, durationMs: duration }
              });
              if (agentLogger.isDebugEnabled()) {
                agentLogger.debug("Result preview (head)", {
                  step: "cursor-run",
                  details: finalText.slice(0, 300)
                });
                agentLogger.debug("Result preview (tail)", {
                  step: "cursor-run",
                  details: finalText.slice(-300)
                });
              }
              
              // Resolve immediately when we get the result
              // Let the process exit naturally
              resolve({
                success: true,
                events,
                finalText: finalText || accumulatedText,
                error: undefined,
                duration_ms: event.duration_ms || Date.now() - startTime,
              });
              return;
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        const errorStr = data.toString();
        error = errorStr;
        // Always log stderr for debugging
        agentLogger.warn("cursor-agent stderr output", {
          step: "cursor-run",
          details: errorStr.trim(),
          alwaysDetails: true
        });
      });

      child.on("close", (code: number | null) => {
        if (resolved) return; // Already resolved from result event
        resolved = true;
        clearTimeout(timeout);
        const duration_ms = Date.now() - startTime;
        if (agentLogger.isDebugEnabled()) {
          agentLogger.debug("cursor-agent process closed", {
            step: "cursor-run",
            details: { exitCode: code, durationMs: duration_ms }
          });
        }

        resolve({
          success: code === 0,
          events,
          finalText: finalText || accumulatedText,
          error: code !== 0 ? error : undefined,
          duration_ms,
        });
      });
    });
  }

  /**
   * Generate with streaming support for real-time progress tracking
   */
  async generateStream(options: CursorOptions): Promise<CursorStreamResult> {
    return this.generateStreamWithCallback(options);
  }

  private buildCommand(options: CursorOptions): string {
    const parts = ["cursor-agent"];

    parts.push("--print"); // Always use print mode for headless usage

    if (options.outputFormat) {
      parts.push("--output-format", options.outputFormat);
    }

    if (options.force) {
      parts.push("--force");
    }

    if (options.model) {
      parts.push("--model", options.model);
    }

    if (options.resumeChatId) {
      parts.push("--resume", options.resumeChatId);
    }

    if (options.apiKey) {
      parts.push("--api-key", options.apiKey);
    }

    // Build full prompt with system instructions embedded
    let fullPrompt = options.prompt;
    if (options.systemPrompt) {
      // Embed system prompt as clear instructions with strong separators
      fullPrompt = `SYSTEM INSTRUCTIONS:
${options.systemPrompt}

USER REQUEST:
${options.prompt}

IMPORTANT: Follow the SYSTEM INSTRUCTIONS exactly. Output only the requested format (JSON, code, etc.) without any additional explanation or commentary.`;
    }
    
    // Escape the prompt for shell
    const escapedPrompt = fullPrompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
    
    parts.push(`"${escapedPrompt}"`);

    return parts.join(" ");
  }
}

// Export a default instance
export const cursor = new CursorAgent();

// Export the class for custom instances
export { CursorAgent };

