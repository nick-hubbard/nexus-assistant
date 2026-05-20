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

const SpeakPromptExchangeResponseCommandSchema = z.object({
  type: z.literal("prompt-exchange-response.speak"),
  deviceId: z.string().min(1),
  promptExchangeId: z.string().min(1),
  responseText: z.string().min(1),
  replaceCurrent: z.literal(true),
});

export type SpeakPromptExchangeResponseCommand = z.input<
  typeof SpeakPromptExchangeResponseCommandSchema
>;

interface DeviceRuntimeClientOptions {
  webSocketUrl?: string;
}

interface DeviceRuntimeConnectionHandlers {
  onWakePhraseDetected: (event: DeviceWakePhraseDetectedEvent) => void;
  onSpeechCaptureStarted?: (event: DeviceSpeechCaptureStartedEvent) => void;
  onSpeechTranscribed?: (event: DeviceSpeechTranscribedEvent) => void;
}

export function createDeviceRuntimeClient(options: DeviceRuntimeClientOptions = {}) {
  const webSocketUrl =
    options.webSocketUrl ?? process.env.NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL ?? "ws://127.0.0.1:4318";

  return {
    speakPromptExchangeResponse(command: SpeakPromptExchangeResponseCommand) {
      const parsedCommand = SpeakPromptExchangeResponseCommandSchema.parse(command);
      const socket = new WebSocket(`${webSocketUrl}/commands`);
      const serializedCommand = JSON.stringify(parsedCommand);

      const sendCommand = () => {
        socket.send(serializedCommand);
        socket.close();
      };

      socket.addEventListener("open", sendCommand, { once: true });
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
