import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceScreen } from "../src";

const baseProps = {
  assistantResponse: "",
  connectionState: "connected" as const,
  currentTime: "10:24 AM",
  onPromptChange: vi.fn(),
  onSubmitPrompt: vi.fn(),
  prompt: "",
  promptState: "idle" as const,
};

afterEach(() => {
  cleanup();
});

describe("DeviceScreen", () => {
  it("renders connected state", () => {
    render(<DeviceScreen {...baseProps} promptComposerVisible />);

    expect(screen.getByText("10:24 AM")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a prompt.")).toBeInTheDocument();
  });

  it("hides the prompt composer until the device wakes", () => {
    render(<DeviceScreen {...baseProps} promptComposerVisible={false} />);

    expect(screen.getByRole("main")).not.toHaveClass("nexus-aurora-active");
    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send prompt/i })).not.toBeInTheDocument();
    expect(screen.getByText("Standby")).toBeInTheDocument();
  });

  it("shows the aurora border while the prompt composer is active", () => {
    render(<DeviceScreen {...baseProps} promptComposerVisible />);

    expect(screen.getByRole("main")).toHaveClass("nexus-aurora-active");
  });

  it("renders disconnected state and disables submission", () => {
    render(<DeviceScreen {...baseProps} connectionState="disconnected" prompt="Hello" />);

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send prompt/i })).toBeDisabled();
  });

  it("renders sending state", () => {
    render(<DeviceScreen {...baseProps} prompt="Hello" promptState="sending" />);

    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send prompt/i })).toBeDisabled();
  });

  it("renders assistant response state", () => {
    render(
      <DeviceScreen
        {...baseProps}
        assistantResponse="Fake provider response: Hello"
        promptState="completed"
      />,
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Fake provider response: Hello")).toBeInTheDocument();
  });

  it("submits a prompt when connected and ready", async () => {
    const onSubmitPrompt = vi.fn();
    render(<DeviceScreen {...baseProps} onSubmitPrompt={onSubmitPrompt} prompt="Hello" />);

    fireEvent.click(screen.getByRole("button", { name: /send prompt/i }));

    expect(onSubmitPrompt).toHaveBeenCalledTimes(1);
  });
});
