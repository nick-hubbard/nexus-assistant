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
const connectDeviceRuntime = vi.fn((handlers: { onWakePhraseDetected: () => void }) => {
  onWakePhraseDetected = handlers.onWakePhraseDetected;
  return vi.fn();
});
const submitPrompt = vi.fn();

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
  submitPrompt.mockClear();
});

describe("DeviceClient", () => {
  it("wakes the prompt composer with Option+T in development mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEVICE_UI_MODE", "development");

    render(<DeviceClient />);

    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Dead", code: "KeyT", altKey: true });

    expect(screen.getByLabelText("Prompt input")).toHaveFocus();
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
    expect(screen.getByText("Standby")).toBeInTheDocument();
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
    expect(screen.getByText("Standby")).toBeInTheDocument();
  });
});
