import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeviceSurfacePlugin, nestHubDeviceSurfacePlugin } from "../src";

const surfaceProps = {
  assistantResponse: "",
  connectionState: "connected" as const,
  currentTime: "10:24 AM",
  device: {
    id: "dev_device-ui",
    locale: "en-US",
    timezone: "America/Indiana/Indianapolis",
  },
  onPromptChange: vi.fn(),
  onSubmitPrompt: vi.fn(),
  prompt: "",
  promptComposerVisible: false,
  promptState: "idle" as const,
};

afterEach(() => {
  cleanup();
});

describe("Device Surface registry", () => {
  it("returns the Nest Hub surface by id", () => {
    const plugin = getDeviceSurfacePlugin("nest-hub");

    expect(plugin.name).toBe("Nest Hub");
  });

  it("renders the Nest Hub surface", () => {
    const Surface = nestHubDeviceSurfacePlugin.Surface;

    render(<Surface {...surfaceProps} settings={nestHubDeviceSurfacePlugin.defaultSettings} />);

    expect(screen.getByText("10:24 AM")).toBeInTheDocument();
    expect(screen.queryByLabelText("Prompt input")).not.toBeInTheDocument();
  });

  it("falls back to the core surface for an unknown id", () => {
    const plugin = getDeviceSurfacePlugin("missing-surface");

    expect(plugin.id).toBe("core");
  });

  it("keeps prompt submission available in the Nest Hub surface", () => {
    const onSubmitPrompt = vi.fn();
    const Surface = nestHubDeviceSurfacePlugin.Surface;

    render(
      <Surface
        {...surfaceProps}
        onSubmitPrompt={onSubmitPrompt}
        prompt="Hello"
        promptComposerVisible
        settings={nestHubDeviceSurfacePlugin.defaultSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /send prompt/i }));

    expect(onSubmitPrompt).toHaveBeenCalledTimes(1);
  });
});
