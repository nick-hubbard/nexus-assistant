"use client";

import { DeviceScreen, type PromptState } from "@open-nexus/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrainClient } from "../src/brain-client";

const deviceId = "dev_device-ui";

export function DeviceClient() {
  const client = useMemo(() => createBrainClient(), []);
  const promptExchangeIdRef = useRef<string | undefined>(undefined);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [connected, setConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => formatCurrentTime());
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [prompt, setPrompt] = useState("");
  const [promptState, setPromptState] = useState<PromptState>("idle");

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatCurrentTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return client.connect({
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
      onEvent: (event) => {
        const activePromptExchangeId = promptExchangeIdRef.current;
        if (
          "promptExchangeId" in event &&
          activePromptExchangeId &&
          event.promptExchangeId !== activePromptExchangeId
        ) {
          return;
        }

        if (event.type === "prompt-exchange.started") {
          setPromptState("streaming");
          setAssistantResponse("");
        }

        if (event.type === "prompt-exchange.delta") {
          setPromptState("streaming");
          setAssistantResponse((response) => `${response}${event.payload.delta}`);
        }

        if (event.type === "prompt-exchange.completed") {
          setPromptState("completed");
          setAssistantResponse(event.payload.response);
        }

        if (event.type === "prompt-exchange.failed") {
          setPromptState("failed");
          setErrorMessage(event.payload.systemIssue.message);
        }
      },
    });
  }, [client]);

  async function submitPrompt() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || promptState === "sending" || promptState === "streaming") {
      return;
    }

    setAssistantResponse("");
    setErrorMessage(undefined);
    setPromptState("sending");

    try {
      const accepted = await client.submitPrompt({
        deviceId,
        prompt: trimmedPrompt,
        requestedAt: new Date().toISOString(),
        context: {
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      promptExchangeIdRef.current = accepted.promptExchangeId;
    } catch (error) {
      setPromptState("failed");
      setErrorMessage(error instanceof Error ? error.message : "Prompt submission failed.");
    }
  }

  return (
    <DeviceScreen
      assistantResponse={assistantResponse}
      connectionState={connected ? "connected" : "disconnected"}
      currentTime={currentTime}
      errorMessage={errorMessage}
      onPromptChange={setPrompt}
      onSubmitPrompt={submitPrompt}
      prompt={prompt}
      promptState={promptState}
    />
  );
}

function formatCurrentTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}
