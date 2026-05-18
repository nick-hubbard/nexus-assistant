import { z } from "zod";

const DeviceWakePhraseDetectedEventSchema = z.object({
  type: z.literal("device-wake-phrase.detected"),
  detectedAt: z.string().datetime(),
  phrase: z.string().min(1),
});

export type DeviceWakePhraseDetectedEvent = z.infer<typeof DeviceWakePhraseDetectedEventSchema>;

interface DeviceRuntimeClientOptions {
  webSocketUrl?: string;
}

interface DeviceRuntimeConnectionHandlers {
  onWakePhraseDetected: (event: DeviceWakePhraseDetectedEvent) => void;
}

export function createDeviceRuntimeClient(options: DeviceRuntimeClientOptions = {}) {
  const webSocketUrl =
    options.webSocketUrl ?? process.env.NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL ?? "ws://127.0.0.1:4318";

  return {
    connect(handlers: DeviceRuntimeConnectionHandlers) {
      const socket = new WebSocket(`${webSocketUrl}/events`);
      let active = true;

      const handleMessage = (message: MessageEvent) => {
        if (!active) {
          return;
        }

        const event = DeviceWakePhraseDetectedEventSchema.safeParse(JSON.parse(message.data));
        if (event.success) {
          handlers.onWakePhraseDetected(event.data);
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
