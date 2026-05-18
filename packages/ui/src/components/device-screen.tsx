import { clsx } from "clsx";
import type { FormEvent, Ref } from "react";
import { Button, Panel, SendIcon, SendingIcon, StatusBadge, Textarea } from "./primitives";

export type ConnectionState = "connected" | "disconnected";
export type PromptState = "idle" | "sending" | "streaming" | "completed" | "failed";

export interface DeviceScreenProps {
  assistantResponse: string;
  connectionState: ConnectionState;
  currentTime: string;
  errorMessage?: string | undefined;
  onPromptChange: (prompt: string) => void;
  onSubmitPrompt: () => void;
  prompt: string;
  promptComposerVisible?: boolean;
  promptInputRef?: Ref<HTMLTextAreaElement> | undefined;
  promptState: PromptState;
}

export function DeviceScreen({
  assistantResponse,
  connectionState,
  currentTime,
  errorMessage,
  onPromptChange,
  onSubmitPrompt,
  prompt,
  promptComposerVisible = true,
  promptInputRef,
  promptState,
}: DeviceScreenProps) {
  const isSending = promptState === "sending";
  const isBusy = promptState === "sending" || promptState === "streaming";
  const connected = connectionState === "connected";
  const auroraActive = promptComposerVisible || isBusy;

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitPrompt();
  }

  return (
    <main className={clsx("nexus-device-shell", auroraActive && "nexus-aurora-active")}>
      <header className="nexus-device-header">
        <div>
          <p className="nexus-eyebrow">Open Nexus Device</p>
          <h1>{currentTime}</h1>
        </div>
        <StatusBadge connected={connected} />
      </header>

      <Panel aria-labelledby="prompt-title">
        <div className="nexus-section-heading">
          <h2 id="prompt-title">Prompt</h2>
          <span>{stateLabel(promptState)}</span>
        </div>
        {promptComposerVisible ? (
          <form className="nexus-prompt-form" onSubmit={submitPrompt}>
            <Textarea
              aria-label="Prompt input"
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Ask the assistant what is next..."
              ref={promptInputRef}
              rows={5}
              value={prompt}
            />
            <Button disabled={!connected || isBusy || prompt.trim().length === 0} type="submit">
              {isSending ? <SendingIcon /> : <SendIcon />}
              Send prompt
            </Button>
          </form>
        ) : (
          <p className="nexus-standby">Standby</p>
        )}
        {errorMessage ? <p className="nexus-error">{errorMessage}</p> : null}
      </Panel>

      <Panel aria-labelledby="response-title">
        <div className="nexus-section-heading">
          <h2 id="response-title">Assistant response</h2>
        </div>
        <output className="nexus-response-output" aria-live="polite">
          {assistantResponse || "Waiting for a prompt."}
        </output>
      </Panel>
    </main>
  );
}

function stateLabel(state: PromptState) {
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
