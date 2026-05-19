import {
  PromptExchangeAcceptedSchema,
  type PromptRequest,
  type WebSocketEvent,
  WebSocketEventSchema,
} from "@open-nexus/protocol";

interface BrainClientOptions {
  httpUrl?: string;
  webSocketUrl?: string;
}

export interface BrainConnectionHandlers {
  onConnected: () => void;
  onDisconnected: () => void;
  onEvent: (event: WebSocketEvent) => void;
}

export type BrainClient = ReturnType<typeof createBrainClient>;

function getKioskBrainUrlParam(name: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value ? value : undefined;
}

export function createBrainClient(options: BrainClientOptions = {}) {
  const httpUrl =
    options.httpUrl ??
    getKioskBrainUrlParam("brainHttpUrl") ??
    process.env.NEXT_PUBLIC_BRAIN_HTTP_URL ??
    "http://127.0.0.1:4317";
  const webSocketUrl =
    options.webSocketUrl ??
    getKioskBrainUrlParam("brainWsUrl") ??
    process.env.NEXT_PUBLIC_BRAIN_WS_URL ??
    "ws://127.0.0.1:4317";

  return {
    connect(handlers: BrainConnectionHandlers) {
      const socket = new WebSocket(`${webSocketUrl}/events`);
      let active = true;

      const markConnected = () => {
        if (active) {
          handlers.onConnected();
        }
      };
      const markDisconnected = () => {
        if (active) {
          handlers.onDisconnected();
        }
      };
      const handleMessage = (message: MessageEvent) => {
        if (active) {
          handlers.onEvent(WebSocketEventSchema.parse(JSON.parse(message.data)));
        }
      };

      socket.addEventListener("open", markConnected);
      socket.addEventListener("close", markDisconnected);
      socket.addEventListener("error", markDisconnected);
      socket.addEventListener("message", handleMessage);

      return () => {
        active = false;
        socket.removeEventListener("open", markConnected);
        socket.removeEventListener("close", markDisconnected);
        socket.removeEventListener("error", markDisconnected);
        socket.removeEventListener("message", handleMessage);
        socket.close();
      };
    },

    async submitPrompt(promptRequest: PromptRequest) {
      const response = await fetch(`${httpUrl}/prompts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(promptRequest),
      });

      if (!response.ok) {
        throw new Error(`Brain Server rejected prompt with HTTP ${response.status}.`);
      }

      return PromptExchangeAcceptedSchema.parse(await response.json());
    },
  };
}
