"use client";

import { DeviceScreen, type PromptState } from "@open-nexus/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrainClient } from "../src/brain-client";
import { createDeviceRuntimeClient } from "../src/device-runtime-client";

const deviceId = "dev_device-ui";
const standbyDelayMs = 5000;

export function DeviceClient() {
  const client = useMemo(() => createBrainClient(), []);
  const deviceRuntimeClient = useMemo(() => createDeviceRuntimeClient(), []);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const promptExchangeIdRef = useRef<string | undefined>(undefined);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [connected, setConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => formatCurrentTime());
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [prompt, setPrompt] = useState("");
  const [promptComposerVisible, setPromptComposerVisible] = useState(false);
  const [promptState, setPromptState] = useState<PromptState>("idle");

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatCurrentTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const wakePromptComposer = useCallback(() => {
    setPromptComposerVisible(true);
  }, []);

  useEffect(() => {
    if (!isDevelopmentDeviceUiMode()) {
      return undefined;
    }

    const wakeWithShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "KeyT") {
        event.preventDefault();
        wakePromptComposer();
      }
    };

    window.addEventListener("keydown", wakeWithShortcut);
    return () => window.removeEventListener("keydown", wakeWithShortcut);
  }, [wakePromptComposer]);

  useEffect(() => {
    return deviceRuntimeClient.connect({
      onWakePhraseDetected: wakePromptComposer,
    });
  }, [deviceRuntimeClient, wakePromptComposer]);

  useEffect(() => {
    if (promptComposerVisible) {
      promptInputRef.current?.focus();
    }
  }, [promptComposerVisible]);

  useEffect(() => {
    if (
      !promptComposerVisible ||
      promptState === "sending" ||
      promptState === "streaming" ||
      (promptState === "idle" && prompt.trim().length > 0)
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => setPromptComposerVisible(false), standbyDelayMs);
    return () => window.clearTimeout(timer);
  }, [prompt, promptComposerVisible, promptState]);

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
      promptComposerVisible={promptComposerVisible}
      promptInputRef={promptInputRef}
      promptState={promptState}
    />
  );
}

function isDevelopmentDeviceUiMode() {
  return (
    process.env.NEXT_PUBLIC_DEVICE_UI_MODE === "development" ||
    (!process.env.NEXT_PUBLIC_DEVICE_UI_MODE && process.env.NODE_ENV === "development")
  );
}

function formatCurrentTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}
