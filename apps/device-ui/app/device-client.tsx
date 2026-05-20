"use client";

import { nestHubDeviceSurfacePlugin, type PromptState } from "@open-nexus/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrainClient } from "../src/brain-client";
import {
  createDeviceRuntimeClient,
  type SpokenResponseRuntimeResult,
} from "../src/device-runtime-client";

const deviceId = "dev_device-ui";
const standbyDelayMs = 5000;
type SpokenResponseMode = "voice-only" | "always" | "off";
type PromptStartMode = "text" | "voice";

export function DeviceClient() {
  const client = useMemo(() => createBrainClient(), []);
  const deviceRuntimeClient = useMemo(() => createDeviceRuntimeClient(), []);
  const activeDeviceSurface = nestHubDeviceSurfacePlugin;
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const promptExchangeIdRef = useRef<string | undefined>(undefined);
  const promptRef = useRef("");
  const promptStateRef = useRef<PromptState>("idle");
  const spokenPromptExchangeIdRef = useRef<string | undefined>(undefined);
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
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    promptStateRef.current = promptState;
  }, [promptState]);

  const submitPrompt = useCallback(
    async (promptOverride?: string, options: { startedBy?: PromptStartMode } = {}) => {
      const trimmedPrompt = (promptOverride ?? promptRef.current).trim();
      const currentPromptState = promptStateRef.current;
      const startedBy = options.startedBy ?? "text";

      if (
        !trimmedPrompt ||
        currentPromptState === "sending" ||
        currentPromptState === "streaming"
      ) {
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
        if (shouldSpeakPromptExchange(startedBy)) {
          spokenPromptExchangeIdRef.current = accepted.promptExchangeId;
        }
      } catch (error) {
        setPromptState("failed");
        setErrorMessage(error instanceof Error ? error.message : "Prompt submission failed.");
      }
    },
    [client],
  );

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
      onSpeechCaptureStarted: () => {
        wakePromptComposer();
        setPrompt("");
        setAssistantResponse("Listening...");
        setErrorMessage(undefined);
        setPromptState("idle");
      },
      onSpeechTranscribed: (event) => {
        wakePromptComposer();
        setPrompt(event.transcript);
        void submitPrompt(event.transcript, { startedBy: "voice" });
      },
    });
  }, [deviceRuntimeClient, submitPrompt, wakePromptComposer]);

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
          if (event.promptExchangeId === spokenPromptExchangeIdRef.current) {
            void speakSelectedPromptExchangeResponse({
              deviceRuntimeClient,
              promptExchangeId: event.promptExchangeId,
              responseText: event.payload.response,
            });
            spokenPromptExchangeIdRef.current = undefined;
          }
        }

        if (event.type === "prompt-exchange.failed") {
          setPromptState("failed");
          setErrorMessage(event.payload.systemIssue.message);
          if (event.promptExchangeId === spokenPromptExchangeIdRef.current) {
            spokenPromptExchangeIdRef.current = undefined;
          }
        }
      },
    });
  }, [client, deviceRuntimeClient]);

  const ActiveDeviceSurface = activeDeviceSurface.Surface;

  return (
    <ActiveDeviceSurface
      assistantResponse={assistantResponse}
      connectionState={connected ? "connected" : "disconnected"}
      currentTime={currentTime}
      device={{
        id: deviceId,
        locale: getDeviceLocale(),
        timezone: getDeviceTimezone(),
      }}
      errorMessage={errorMessage}
      onPromptChange={setPrompt}
      onSubmitPrompt={submitPrompt}
      prompt={prompt}
      promptComposerVisible={promptComposerVisible}
      promptInputRef={promptInputRef}
      promptState={promptState}
      settings={activeDeviceSurface.defaultSettings}
    />
  );
}

async function speakSelectedPromptExchangeResponse(options: {
  deviceRuntimeClient: ReturnType<typeof createDeviceRuntimeClient>;
  promptExchangeId: string;
  responseText: string;
}) {
  const runtimeResult = await options.deviceRuntimeClient.speakPromptExchangeResponse({
    type: "prompt-exchange-response.speak",
    deviceId,
    promptExchangeId: options.promptExchangeId,
    responseText: options.responseText,
    replaceCurrent: true,
  });

  if (runtimeResult.status === "accepted") {
    return;
  }

  logSpokenResponseIssue(runtimeResult);
  speakWithBrowserFallback(options.responseText);
}

function isDevelopmentDeviceUiMode() {
  return (
    process.env.NEXT_PUBLIC_DEVICE_UI_MODE === "development" ||
    (!process.env.NEXT_PUBLIC_DEVICE_UI_MODE && process.env.NODE_ENV === "development")
  );
}

function getSpokenResponseMode(): SpokenResponseMode {
  if (
    process.env.NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES === "always" ||
    process.env.NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES === "off"
  ) {
    return process.env.NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES;
  }

  return "voice-only";
}

function shouldSpeakPromptExchange(startedBy: PromptStartMode) {
  const mode = getSpokenResponseMode();

  return mode === "always" || (mode === "voice-only" && startedBy === "voice");
}

function speakWithBrowserFallback(responseText: string) {
  if (!isDevelopmentDeviceUiMode() || typeof window === "undefined") {
    return false;
  }

  const speechSynthesis = window.speechSynthesis;
  const SpeechSynthesisUtteranceCtor = window.SpeechSynthesisUtterance;
  if (!speechSynthesis || !SpeechSynthesisUtteranceCtor) {
    logSpokenResponseIssue({ status: "unavailable", reason: "browser_speech_unavailable" });
    return false;
  }

  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtteranceCtor(responseText));
  return true;
}

function logSpokenResponseIssue(
  result: Exclude<SpokenResponseRuntimeResult, { status: "accepted" }>,
) {
  console.warn("Spoken Response audio path unavailable.", {
    category: "runtime",
    reason: result.reason,
  });
}

function formatCurrentTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function getDeviceLocale() {
  return typeof navigator === "undefined" ? "en-US" : navigator.language;
}

function getDeviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
