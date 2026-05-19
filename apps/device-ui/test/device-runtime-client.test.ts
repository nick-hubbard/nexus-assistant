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
  it("reports Voice Control events from the Device Runtime socket", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const onWakePhraseDetected = vi.fn();
    const onSpeechCaptureStarted = vi.fn();
    const onSpeechTranscribed = vi.fn();

    createDeviceRuntimeClient({ webSocketUrl: "ws://device-runtime.test" }).connect({
      onWakePhraseDetected,
      onSpeechCaptureStarted,
      onSpeechTranscribed,
    });

    sockets[0]?.message(
      JSON.stringify({
        type: "device-wake-phrase.detected",
        detectedAt: "2026-05-18T12:00:00.000Z",
        phrase: "Jarvis",
      }),
    );
    sockets[0]?.message(
      JSON.stringify({
        type: "device-speech-capture.started",
        startedAt: "2026-05-18T12:00:01.000Z",
      }),
    );
    sockets[0]?.message(
      JSON.stringify({
        type: "device-speech.transcribed",
        transcribedAt: "2026-05-18T12:00:02.000Z",
        transcript: "turn off the lights",
      }),
    );

    expect(sockets[0]?.url).toBe("ws://device-runtime.test/events");
    expect(onWakePhraseDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        phrase: "Jarvis",
      }),
    );
    expect(onSpeechCaptureStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "device-speech-capture.started",
      }),
    );
    expect(onSpeechTranscribed).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "turn off the lights",
      }),
    );
  });
});
