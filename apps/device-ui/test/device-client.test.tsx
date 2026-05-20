import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceClient } from "../app/device-client";

type BrainHandlers = {
  onConnected: () => void;
  onDisconnected: () => void;
  onEvent: (event: {
    type: "prompt-exchange.completed";
    promptExchangeId: string;
    payload: { response: string };
  }) => void;
};

let brainHandlers: BrainHandlers | undefined;
const connect = vi.fn((handlers: BrainHandlers) => {
  brainHandlers = handlers;
  return vi.fn();
});
let onWakePhraseDetected: (() => void) | undefined;
let onSpeechCaptureStarted: (() => void) | undefined;
let onSpeechTranscribed: ((event: { transcript: string }) => void) | undefined;
const connectDeviceRuntime = vi.fn(
  (handlers: {
    onWakePhraseDetected: () => void;
    onSpeechCaptureStarted?: () => void;
    onSpeechTranscribed?: (event: { transcript: string }) => void;
  }) => {
    onWakePhraseDetected = handlers.onWakePhraseDetected;
    onSpeechCaptureStarted = handlers.onSpeechCaptureStarted;
    onSpeechTranscribed = handlers.onSpeechTranscribed;
    return vi.fn();
  },
);
const submitPrompt = vi.fn();

function stubSpeechSynthesis() {
  const cancel = vi.fn();
  const speak = vi.fn();
  class MockSpeechSynthesisUtterance {
    text: string;

    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel, speak },
  });

  return { cancel, speak };
}

vi.mock("../src/brain-client", () => ({
  createBrainClient: () => ({
    connect,
    submitPrompt,
  }),
}));

vi.mock("../src/device-runtime-client", () => ({
  createDeviceRuntimeClient: () => ({
    connect: connectDeviceRuntime,
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  connect.mockClear();
  brainHandlers = undefined;
  connectDeviceRuntime.mockClear();
  onWakePhraseDetected = undefined;
  onSpeechCaptureStarted = undefined;
  onSpeechTranscribed = undefined;
  submitPrompt.mockClear();
});

describe("DeviceClient", () => {
  it("wakes the prompt composer with Option+T in development mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");

    render(<DeviceClient />);

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });

    expect(screen.getByLabelText("Prompt input")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Assistant response" })).toBeInTheDocument();
  });

  it("keeps the development wake shortcut disabled outside development mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "production");

    render(<DeviceClient />);

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();
  });

  it("enables the development wake shortcut during Next.js development mode", () => {
    vi.stubEnv("NODE_ENV", "development");

    render(<DeviceClient />);

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });

    expect(screen.getByLabelText("Prompt input")).toHaveFocus();
  });

  it("wakes the prompt composer when the Device Runtime detects the device wake phrase", () => {
    render(<DeviceClient />);

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();

    act(() => {
      onWakePhraseDetected?.();
    });

    expect(screen.getByLabelText("Prompt input")).toHaveFocus();
  });

  it("submits transcribed speech through the Brain Server prompt path", async () => {
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
      onSpeechCaptureStarted?.();
    });

    expect(screen.getByText("Listening...")).toBeInTheDocument();

    act(() => {
      onSpeechTranscribed?.({ transcript: "turn off the lights" });
    });

    expect(screen.getByLabelText("Prompt input")).toHaveValue("turn off the lights");
    await vi.waitFor(() =>
      expect(submitPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "turn off the lights",
        }),
      ),
    );
  });

  it("speaks the response for a voice-started Prompt Exchange in voice-only mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES", "voice-only");
    const { cancel, speak } = stubSpeechSynthesis();
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
      onSpeechTranscribed?.({ transcript: "turn off the lights" });
    });
    await vi.waitFor(() => expect(submitPrompt).toHaveBeenCalledTimes(1));

    act(() => {
      brainHandlers?.onEvent({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        payload: { response: "The lights are off." },
      });
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "The lights are off." }));
  });

  it("does not speak text-started Prompt Exchanges in voice-only mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES", "voice-only");
    const { cancel, speak } = stubSpeechSynthesis();
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
    });
    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });
    fireEvent.change(screen.getByLabelText("Prompt input"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send prompt/i }));
    await vi.waitFor(() => expect(submitPrompt).toHaveBeenCalledTimes(1));

    act(() => {
      brainHandlers?.onEvent({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        payload: { response: "Hello back." },
      });
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(screen.getByText("Hello back.")).toBeInTheDocument();
  });

  it("speaks text-started Prompt Exchanges in always mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES", "always");
    const { cancel, speak } = stubSpeechSynthesis();
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
    });
    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });
    fireEvent.change(screen.getByLabelText("Prompt input"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send prompt/i }));
    await vi.waitFor(() => expect(submitPrompt).toHaveBeenCalledTimes(1));

    act(() => {
      brainHandlers?.onEvent({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        payload: { response: "Hello back." },
      });
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello back." }));
  });

  it("keeps visible responses but disables spoken responses in off mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES", "off");
    const { cancel, speak } = stubSpeechSynthesis();
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
      onSpeechTranscribed?.({ transcript: "turn off the lights" });
    });
    await vi.waitFor(() => expect(submitPrompt).toHaveBeenCalledTimes(1));

    act(() => {
      brainHandlers?.onEvent({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        payload: { response: "The lights are off." },
      });
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(screen.getByText("The lights are off.")).toBeInTheDocument();
  });

  it("returns to standby after five idle seconds when no prompt is submitted", () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");

    render(<DeviceClient />);

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });
    expect(screen.getByLabelText("Prompt input")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();
    expect(screen.getByText(/\d+:\d{2}/)).toBeInTheDocument();
  });

  it("keeps the prompt composer open after the user starts typing", () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");

    render(<DeviceClient />);

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });
    fireEvent.change(screen.getByLabelText("Prompt input"), { target: { value: "Hello" } });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByLabelText("Prompt input")).toHaveValue("Hello");
  });

  it("returns to standby five seconds after a prompt exchange completes", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");
    submitPrompt.mockResolvedValue({
      promptExchangeId: "px_123456789012",
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    render(<DeviceClient />);

    act(() => {
      brainHandlers?.onConnected();
    });
    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });
    fireEvent.change(screen.getByLabelText("Prompt input"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send prompt/i }));

    await vi.waitFor(() => expect(submitPrompt).toHaveBeenCalledTimes(1));

    act(() => {
      brainHandlers?.onEvent({
        type: "prompt-exchange.completed",
        promptExchangeId: "px_123456789012",
        payload: { response: "Done" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();
    expect(screen.getByText(/\d+:\d{2}/)).toBeInTheDocument();
  });
});
