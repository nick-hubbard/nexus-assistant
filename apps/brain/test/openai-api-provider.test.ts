import { describe, expect, it } from "vitest";
import { OpenAiApiProvider, parseServerSentEvents } from "../src/openai-api-provider.js";
import { AiProviderError } from "../src/provider.js";

describe("OpenAI API Provider", () => {
  it("streams output text deltas from Responses API events", async () => {
    const requests: string[] = [];
    const provider = new OpenAiApiProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.test/v1/",
      model: "gpt-5.5",
      timeoutMs: 5000,
      reasoningEffort: "low",
      verbosity: "low",
      fetch: async (request, init) => {
        requests.push(String(request));
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: "gpt-5.5",
          input: "Hello",
          stream: true,
          reasoning: { effort: "low" },
          text: {
            format: { type: "text" },
            verbosity: "low",
          },
        });

        return new Response(
          sseStream([
            { type: "response.output_text.delta", delta: "Hi " },
            { type: "response.output_text.delta", delta: "there." },
            { type: "response.completed", response: { status: "completed" } },
          ]),
          { status: 200 },
        );
      },
    });

    await expect(collect(provider)).resolves.toEqual([{ delta: "Hi " }, { delta: "there." }]);
    expect(requests).toEqual(["https://api.openai.test/v1/responses"]);
  });

  it("surfaces missing API key diagnostics", async () => {
    const provider = new OpenAiApiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.5",
      timeoutMs: 5000,
      reasoningEffort: "low",
      verbosity: "low",
    });

    await expect(collect(provider)).rejects.toMatchObject({
      providerName: "openai-api",
      message: "OpenAI API key is not configured.",
      diagnostics: {
        missingEnv: "BRAIN_OPENAI_API_KEY or OPENAI_API_KEY",
      },
    });
  });

  it("surfaces unsuccessful API responses", async () => {
    const provider = new OpenAiApiProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.5",
      timeoutMs: 5000,
      reasoningEffort: "low",
      verbosity: "low",
      fetch: async () => new Response("bad key", { status: 401, statusText: "Unauthorized" }),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      providerName: "openai-api",
      message: "OpenAI API request failed.",
      diagnostics: {
        status: 401,
        body: "bad key",
      },
    });
  });

  it("parses server-sent events split across stream chunks", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('event: response.output_text.delta\ndata: {"type":"response.output'),
        );
        controller.enqueue(encoder.encode('_text.delta","delta":"Split"}\n\n'));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseServerSentEvents(stream)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "response.output_text.delta", delta: "Split" }]);
  });

  it("rejects empty streamed responses", async () => {
    const provider = new OpenAiApiProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.5",
      timeoutMs: 5000,
      reasoningEffort: "low",
      verbosity: "low",
      fetch: async () =>
        new Response(
          sseStream([{ type: "response.completed", response: { status: "completed" } }]),
        ),
    });

    await expect(collect(provider)).rejects.toBeInstanceOf(AiProviderError);
  });
});

async function collect(provider: OpenAiApiProvider) {
  const chunks = [];

  for await (const chunk of provider.complete({ prompt: "Hello" })) {
    chunks.push(chunk);
  }

  return chunks;
}

function sseStream(events: unknown[]) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}
