import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrainClient } from "../src/brain-client.js";

const sockets: MockWebSocket[] = [];

class MockWebSocket extends EventTarget {
  static instances = sockets;
  url: string;

  constructor(url: string) {
    super();
    this.url = url;
    sockets.push(this);
  }

  close() {
    this.dispatchEvent(new Event("close"));
  }

  open() {
    this.dispatchEvent(new Event("open"));
  }

  message(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  sockets.splice(0);
});

describe("createBrainClient", () => {
  it("reports connected, disconnected, and response events from the Brain Server socket", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const handlers = {
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onEvent: vi.fn(),
    };

    const disconnect = createBrainClient({ webSocketUrl: "ws://brain.test" }).connect(handlers);
    const socket = sockets[0];

    socket?.open();
    socket?.message(
      JSON.stringify({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        occurredAt: new Date().toISOString(),
        payload: {
          status: "completed",
          response: "Fake provider response: Hello",
        },
      }),
    );
    socket?.close();
    disconnect();

    expect(socket?.url).toBe("ws://brain.test/events");
    expect(handlers.onConnected).toHaveBeenCalledTimes(1);
    expect(handlers.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "prompt-exchange.completed",
      }),
    );
    expect(handlers.onDisconnected).toHaveBeenCalledTimes(1);
  });

  it("posts prompts to the Brain Server", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        promptExchangeId: "px_123456789012",
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const accepted = await createBrainClient({ httpUrl: "http://brain.test" }).submitPrompt({
      deviceId: "dev_device-ui",
      prompt: "Hello",
      requestedAt: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://brain.test/prompts",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(accepted.status).toBe("accepted");
  });

  it("uses Brain Server URLs passed through kiosk launch query params", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    window.history.replaceState(
      null,
      "",
      "/?brainHttpUrl=http%3A%2F%2Fbrain.local%3A4317&brainWsUrl=ws%3A%2F%2Fbrain.local%3A4317",
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        promptExchangeId: "px_123456789012",
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createBrainClient();
    client.connect({
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onEvent: vi.fn(),
    });
    await client.submitPrompt({
      deviceId: "dev_device-ui",
      prompt: "Hello",
      requestedAt: new Date().toISOString(),
    });

    expect(sockets[0]?.url).toBe("ws://brain.local:4317/events");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://brain.local:4317/prompts",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
