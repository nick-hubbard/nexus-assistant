import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeviceRuntimeClient } from "../src/device-runtime-client";

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

  message(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  sockets.splice(0);
});

describe("createDeviceRuntimeClient", () => {
  it("reports device wake phrase detection events from the Device Runtime socket", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const onWakePhraseDetected = vi.fn();

    createDeviceRuntimeClient({ webSocketUrl: "ws://device-runtime.test" }).connect({
      onWakePhraseDetected,
    });

    sockets[0]?.message(
      JSON.stringify({
        type: "device-wake-phrase.detected",
        detectedAt: "2026-05-18T12:00:00.000Z",
        phrase: "Jarvis",
      }),
    );

    expect(sockets[0]?.url).toBe("ws://device-runtime.test/events");
    expect(onWakePhraseDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        phrase: "Jarvis",
      }),
    );
  });
});
