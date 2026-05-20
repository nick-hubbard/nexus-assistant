import {
  type SpeakPromptExchangeResponseCommand,
  SpeakPromptExchangeResponseCommandSchema,
} from "@open-nexus/protocol";
import { z } from "zod";

const DeviceWakePhraseDetectedEventSchema = z.object({
  type: z.literal("device-wake-phrase.detected"),
  detectedAt: z.string().datetime(),
  phrase: z.string().min(1),
});

const DeviceSpeechCaptureStartedEventSchema = z.object({
  type: z.literal("device-speech-capture.started"),
  startedAt: z.string().datetime(),
});

const DeviceSpeechTranscribedEventSchema = z.object({
  type: z.literal("device-speech.transcribed"),
  transcribedAt: z.string().datetime(),
  transcript: z.string().trim().min(1),
});

const DeviceRuntimeEventSchema = z.discriminatedUnion("type", [
  DeviceWakePhraseDetectedEventSchema,
  DeviceSpeechCaptureStartedEventSchema,
  DeviceSpeechTranscribedEventSchema,
]);

export type DeviceWakePhraseDetectedEvent = z.infer<typeof DeviceWakePhraseDetectedEventSchema>;
export type DeviceSpeechCaptureStartedEvent = z.infer<typeof DeviceSpeechCaptureStartedEventSchema>;
export type DeviceSpeechTranscribedEvent = z.infer<typeof DeviceSpeechTranscribedEventSchema>;
export type DeviceRuntimeEvent = z.infer<typeof DeviceRuntimeEventSchema>;

interface DeviceRuntimeClientOptions {
  webSocketUrl?: string;
}

export type SpokenResponseRuntimeResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

interface DeviceRuntimeConnectionHandlers {
  onWakePhraseDetected: (event: DeviceWakePhraseDetectedEvent) => void;
  onSpeechCaptureStarted?: (event: DeviceSpeechCaptureStartedEvent) => void;
  onSpeechTranscribed?: (event: DeviceSpeechTranscribedEvent) => void;
}

export function createDeviceRuntimeClient(options: DeviceRuntimeClientOptions = {}) {
  const webSocketUrl =
    options.webSocketUrl ?? process.env.NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL ?? "ws://127.0.0.1:4318";

  return {
    speakPromptExchangeResponse(
      command: SpeakPromptExchangeResponseCommand,
    ): Promise<SpokenResponseRuntimeResult> {
      const parsedCommand = SpeakPromptExchangeResponseCommandSchema.parse(command);
      const socket = new WebSocket(`${webSocketUrl}/commands`);
      const serializedCommand = JSON.stringify(parsedCommand);

      return new Promise((resolve) => {
        let settled = false;
        let commandSent = false;

        const settle = (result: SpokenResponseRuntimeResult) => {
          if (settled) {
            return;
          }

          settled = true;
          socket.removeEventListener("open", sendCommand);
          socket.removeEventListener("message", handleMessage);
          socket.removeEventListener("error", handleError);
          socket.removeEventListener("close", handleClose);
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
          resolve(result);
        };

        const sendCommand = () => {
          commandSent = true;
          socket.send(serializedCommand);
        };

        const handleMessage = (message: MessageEvent) => {
          const response = parseRuntimeCommandResponse(message.data);
          if (!response) {
            return;
          }

          if (response.type === "command.accepted") {
            settle({ status: "accepted" });
            return;
          }

          settle({ status: "rejected", reason: response.reason });
        };

        const handleError = () => {
          settle({ status: "unavailable", reason: "runtime_socket_error" });
        };

        const handleClose = () => {
          if (!settled) {
            settle({
              status: "unavailable",
              reason: commandSent ? "runtime_closed_before_ack" : "runtime_unavailable",
            });
          }
        };

        socket.addEventListener("open", sendCommand);
        socket.addEventListener("message", handleMessage);
        socket.addEventListener("error", handleError);
        socket.addEventListener("close", handleClose);
      });
    },

    connect(handlers: DeviceRuntimeConnectionHandlers) {
      const socket = new WebSocket(`${webSocketUrl}/events`);
      let active = true;

      const handleMessage = (message: MessageEvent) => {
        if (!active) {
          return;
        }

        const event = DeviceRuntimeEventSchema.safeParse(JSON.parse(message.data));
        if (!event.success) {
          return;
        }

        if (event.data.type === "device-wake-phrase.detected") {
          handlers.onWakePhraseDetected(event.data);
        }

        if (event.data.type === "device-speech-capture.started") {
          handlers.onSpeechCaptureStarted?.(event.data);
        }

        if (event.data.type === "device-speech.transcribed") {
          handlers.onSpeechTranscribed?.(event.data);
        }
      };

      socket.addEventListener("message", handleMessage);

      return () => {
        active = false;
        socket.removeEventListener("message", handleMessage);
        socket.close();
      };
    },
  };
}

function parseRuntimeCommandResponse(data: unknown) {
  const response = RuntimeCommandResponseSchema.safeParse(parseJson(data));
  return response.success ? response.data : undefined;
}

const RuntimeCommandResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command.accepted") }),
  z.object({ type: z.literal("command.rejected"), reason: z.string().min(1) }),
]);

function parseJson(data: unknown) {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}
