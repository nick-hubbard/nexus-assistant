import { type AiProvider, AiProviderError, type ProviderPrompt } from "./provider.js";

export interface OpenAiApiProviderOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh";
  verbosity: "low" | "medium" | "high";
  fetch?: typeof fetch;
}

const providerName = "openai-api";

export class OpenAiApiProvider implements AiProvider {
  readonly name = providerName;
  private readonly options: OpenAiApiProviderOptions;

  constructor(options: OpenAiApiProviderOptions) {
    this.options = options;
  }

  async *complete({ prompt }: ProviderPrompt) {
    if (!this.options.apiKey) {
      throw new AiProviderError(providerName, "OpenAI API key is not configured.", {
        missingEnv: "BRAIN_OPENAI_API_KEY or OPENAI_API_KEY",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const fetchImpl = this.options.fetch ?? fetch;

    try {
      const response = await fetchImpl(`${trimTrailingSlash(this.options.baseUrl)}/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          input: prompt,
          stream: true,
          reasoning: { effort: this.options.reasoningEffort },
          text: {
            format: { type: "text" },
            verbosity: this.options.verbosity,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AiProviderError(providerName, "OpenAI API request failed.", {
          status: response.status,
          statusText: response.statusText,
          body: await safeReadErrorBody(response),
        });
      }

      if (!response.body) {
        throw new AiProviderError(providerName, "OpenAI API returned no response body.", {
          status: response.status,
        });
      }

      let outputText = "";
      for await (const event of parseServerSentEvents(response.body)) {
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          outputText += event.delta;
          yield { delta: event.delta };
        }

        if (event.type === "response.failed") {
          throw new AiProviderError(providerName, "OpenAI API response failed.", {
            error: event.response?.error ?? event.error ?? event,
          });
        }
      }

      if (!outputText.trim()) {
        throw new AiProviderError(providerName, "OpenAI API returned an empty response.", {
          model: this.options.model,
        });
      }
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new AiProviderError(providerName, "OpenAI API request timed out.", {
          timeoutMs: this.options.timeoutMs,
          model: this.options.model,
        });
      }

      throw new AiProviderError(providerName, "OpenAI API request could not be completed.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function* parseServerSentEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      yield* drainEventsFromBuffer(
        () => buffer,
        (nextBuffer) => {
          buffer = nextBuffer;
        },
      );
    }

    buffer += decoder.decode();
    yield* drainEventsFromBuffer(
      () => buffer,
      (nextBuffer) => {
        buffer = nextBuffer;
      },
    );
  } finally {
    reader.releaseLock();
  }
}

function* drainEventsFromBuffer(getBuffer: () => string, setBuffer: (buffer: string) => void) {
  let buffer = getBuffer();
  let separatorIndex = eventSeparatorIndex(buffer);

  while (separatorIndex !== -1) {
    const rawEvent = buffer.slice(0, separatorIndex);
    buffer = buffer.slice(separatorIndex + eventSeparatorLength(buffer, separatorIndex));
    const event = parseServerSentEvent(rawEvent);
    if (event) {
      yield event;
    }
    separatorIndex = eventSeparatorIndex(buffer);
  }

  setBuffer(buffer);
}

function parseServerSentEvent(rawEvent: string) {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") {
    return undefined;
  }

  return JSON.parse(data) as {
    type?: string;
    delta?: string;
    response?: { error?: unknown };
    error?: unknown;
  };
}

function eventSeparatorIndex(buffer: string) {
  const newlineIndex = buffer.indexOf("\n\n");
  const carriageReturnIndex = buffer.indexOf("\r\n\r\n");

  if (newlineIndex === -1) {
    return carriageReturnIndex;
  }

  if (carriageReturnIndex === -1) {
    return newlineIndex;
  }

  return Math.min(newlineIndex, carriageReturnIndex);
}

function eventSeparatorLength(buffer: string, index: number) {
  return buffer.startsWith("\r\n\r\n", index) ? 4 : 2;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function safeReadErrorBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
