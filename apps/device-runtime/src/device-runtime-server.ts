import { createServer, type Server } from "node:http";
import { SpeakPromptExchangeResponseCommandSchema } from "@open-nexus/protocol";
import { WebSocketServer } from "ws";
import {
  createLocalSayTtsAdapter,
  type SpokenResponsePlayback,
  type SpokenResponseTtsAdapter,
} from "./tts-adapter.js";

export interface DeviceRuntimeServerOptions {
  host?: string;
  port?: number;
  ttsAdapter?: SpokenResponseTtsAdapter;
}

export interface DeviceRuntimeServer {
  host: string;
  port: number;
  url: string;
  httpServer: Server;
  stop: () => Promise<void>;
}

export async function startDeviceRuntimeServer(options: DeviceRuntimeServerOptions = {}) {
  const host = options.host ?? process.env.DEVICE_RUNTIME_HOST ?? "127.0.0.1";
  const port = options.port ?? parsePort(process.env.DEVICE_RUNTIME_PORT) ?? 4318;
  const ttsAdapter = options.ttsAdapter ?? createLocalSayTtsAdapter();
  let currentPlayback: SpokenResponsePlayback | undefined;

  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          service: "device-runtime",
          checkedAt: new Date().toISOString(),
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const commands = new WebSocketServer({ noServer: true });
  const events = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === "/commands") {
      commands.handleUpgrade(request, socket, head, (webSocket) => {
        commands.emit("connection", webSocket, request);
      });
      return;
    }

    if (request.url === "/events") {
      events.handleUpgrade(request, socket, head, (webSocket) => {
        events.emit("connection", webSocket, request);
      });
      return;
    }

    socket.destroy();
  });

  commands.on("connection", (webSocket) => {
    webSocket.on("message", (data) => {
      const command = SpeakPromptExchangeResponseCommandSchema.safeParse(
        parseJson(data.toString()),
      );

      if (!command.success) {
        webSocket.send(JSON.stringify({ type: "command.rejected", reason: "invalid_command" }));
        return;
      }

      currentPlayback?.cancel();
      const playback = ttsAdapter.speak(command.data);
      currentPlayback = playback;
      playback.finished
        .then(() => {
          if (currentPlayback === playback) {
            currentPlayback = undefined;
          }
        })
        .catch(() => undefined);
      webSocket.send(JSON.stringify({ type: "command.accepted" }));
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve);
  });

  const address = httpServer.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    host,
    port: resolvedPort,
    url: `ws://${host}:${resolvedPort}`,
    httpServer,
    async stop() {
      currentPlayback?.cancel();
      commands.close();
      events.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  } satisfies DeviceRuntimeServer;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parsePort(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("DEVICE_RUNTIME_PORT must be an integer from 0 to 65535.");
  }
  return port;
}
