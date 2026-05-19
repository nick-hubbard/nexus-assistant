import { clsx } from "clsx";
import type { CSSProperties } from "react";
import {
  Button,
  Panel,
  SendIcon,
  SendingIcon,
  StatusBadge,
  Textarea,
} from "../components/primitives";
import type { DeviceSurfacePlugin, DeviceSurfaceProps } from "./types";

export interface NestHubSurfaceSettings {
  backgroundImageUrl: string;
}

const defaultBackgroundImageUrl =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80";

function NestHubDeviceSurface({
  assistantResponse,
  connectionState,
  currentTime,
  errorMessage,
  onPromptChange,
  onSubmitPrompt,
  prompt,
  promptComposerVisible,
  promptInputRef,
  promptState,
  settings,
}: DeviceSurfaceProps<NestHubSurfaceSettings>) {
  const connected = connectionState === "connected";
  const isSending = promptState === "sending";
  const isBusy = promptState === "sending" || promptState === "streaming";
  const auroraActive = promptComposerVisible || isBusy;
  const backgroundImageUrl = settings.backgroundImageUrl || defaultBackgroundImageUrl;

  return (
    <main
      className={clsx("nexus-nest-surface", auroraActive && "nexus-aurora-active")}
      style={{ "--nexus-nest-background": `url("${backgroundImageUrl}")` } as CSSProperties}
    >
      <div className="nexus-nest-vignette" />
      <div className="nexus-nest-status">
        {connected && !errorMessage ? null : <StatusBadge connected={connected} />}
      </div>

      {promptComposerVisible ? (
        <section className="nexus-nest-interaction" aria-label="Assistant prompt">
          <Panel className="nexus-nest-panel">
            <div className="nexus-section-heading">
              <h1 className="nexus-nest-panel-title">Open Nexus</h1>
              <span>{stateLabel(promptState)}</span>
            </div>
            <form
              className="nexus-prompt-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitPrompt();
              }}
            >
              <Textarea
                aria-label="Prompt input"
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="Ask the assistant what is next..."
                ref={promptInputRef}
                rows={4}
                value={prompt}
              />
              <Button disabled={!connected || isBusy || prompt.trim().length === 0} type="submit">
                {isSending ? <SendingIcon /> : <SendIcon />}
                Send prompt
              </Button>
            </form>
            {errorMessage ? <p className="nexus-error">{errorMessage}</p> : null}
          </Panel>

          <Panel className="nexus-nest-panel">
            <div className="nexus-section-heading">
              <h2>Assistant response</h2>
            </div>
            <output className="nexus-response-output" aria-live="polite">
              {assistantResponse || "Waiting for a prompt."}
            </output>
          </Panel>
        </section>
      ) : null}

      <time className="nexus-nest-clock" dateTime={currentTime}>
        {currentTime}
      </time>
    </main>
  );
}

export const nestHubDeviceSurfacePlugin: DeviceSurfacePlugin<NestHubSurfaceSettings> = {
  id: "nest-hub",
  name: "Nest Hub",
  version: "0.1.0",
  defaultSettings: {
    backgroundImageUrl: defaultBackgroundImageUrl,
  },
  Surface: NestHubDeviceSurface,
};

function stateLabel(state: DeviceSurfaceProps["promptState"]) {
  switch (state) {
    case "sending":
      return "Sending";
    case "streaming":
      return "Streaming";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}
