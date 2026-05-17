import http from "node:http";
import {
  HealthResponseSchema,
  PromptExchangeAcceptedSchema,
  PromptRequestSchema,
  type WebSocketEvent,
  WebSocketEventSchema,
} from "@open-nexus/protocol";
import express from "express";
import { type WebSocket, WebSocketServer } from "ws";
import type { BrainConfig } from "./config.js";
import { loadConfig, validateConfig } from "./config.js";
import { FakeAiProvider } from "./fake-provider.js";
import { createPromptExchangeId } from "./ids.js";

interface BrainServerOptions {
  config?: BrainConfig;
  provider?: FakeAiProvider;
}

export function createBrainServer(options: BrainServerOptions = {}) {
  const config = options.config ? validateConfig(options.config) : loadConfig();
  const provider = options.provider ?? new FakeAiProvider();
  const app = express();
  const server = http.createServer(app);
  const events = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();

  app.use(express.json());

  events.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/events") {
      socket.destroy();
      return;
    }

    events.handleUpgrade(request, socket, head, (webSocket) => {
      events.emit("connection", webSocket, request);
    });
  });

  app.get("/health", (_request, response) => {
    response.json(
      HealthResponseSchema.parse({
        ok: true,
        service: "brain-server",
        version: config.version,
        checkedAt: new Date().toISOString(),
      }),
    );
  });

  app.post("/prompts", async (request, response, next) => {
    try {
      const promptRequest = PromptRequestSchema.parse(request.body);
      const promptExchangeId = createPromptExchangeId();
      const acceptedAt = new Date().toISOString();

      response.status(202).json(
        PromptExchangeAcceptedSchema.parse({
          promptExchangeId,
          status: "accepted",
          acceptedAt,
        }),
      );

      void runPromptExchange({
        deviceId: promptRequest.deviceId,
        prompt: promptRequest.prompt,
        promptExchangeId,
        provider,
        publish: (event) => publishEvent(sockets, event),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Invalid Brain Server request.",
      });
    },
  );

  return {
    app,
    server,
    events,
    config,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.close();
        }
        events.close((eventsError) => {
          if (eventsError) {
            reject(eventsError);
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      }),
  };
}

interface RunPromptExchangeOptions {
  deviceId: string;
  prompt: string;
  promptExchangeId: string;
  provider: FakeAiProvider;
  publish: (event: WebSocketEvent) => void;
}

async function runPromptExchange({
  deviceId,
  prompt,
  promptExchangeId,
  provider,
  publish,
}: RunPromptExchangeOptions) {
  publish(
    WebSocketEventSchema.parse({
      type: "prompt-exchange.started",
      promptExchangeId,
      occurredAt: new Date().toISOString(),
      payload: {
        status: "started",
        deviceId,
      },
    }),
  );

  let response = "";
  let sequence = 0;

  for await (const chunk of provider.complete({ prompt })) {
    response += chunk.delta;
    publish(
      WebSocketEventSchema.parse({
        type: "prompt-exchange.delta",
        promptExchangeId,
        occurredAt: new Date().toISOString(),
        payload: {
          status: "streaming",
          delta: chunk.delta,
          sequence,
        },
      }),
    );
    sequence += 1;
  }

  publish(
    WebSocketEventSchema.parse({
      type: "prompt-exchange.completed",
      promptExchangeId,
      occurredAt: new Date().toISOString(),
      payload: {
        status: "completed",
        response,
      },
    }),
  );
}

function publishEvent(sockets: Set<WebSocket>, event: WebSocketEvent) {
  const message = JSON.stringify(event);

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = createBrainServer();
  brain.server.listen(brain.config.port, brain.config.host, () => {
    console.log(`Brain Server listening on http://${brain.config.host}:${brain.config.port}`);
  });
}
