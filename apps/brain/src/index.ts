import http from "node:http";
import "dotenv/config";
import {
  HealthResponseSchema,
  PromptExchangeAcceptedSchema,
  PromptRequestSchema,
  type SystemIssue,
  SystemIssueSchema,
  type WebSocketEvent,
  WebSocketEventSchema,
} from "@open-nexus/protocol";
import express from "express";
import { type WebSocket, WebSocketServer } from "ws";
import { initializeBrainFiles } from "./brain-files.js";
import type { BrainConfig } from "./config.js";
import { loadConfig, validateConfig } from "./config.js";
import { FakeAiProvider } from "./fake-provider.js";
import { createPromptExchangeId, createSystemIssueId } from "./ids.js";
import { InteractionLog } from "./interaction-log.js";
import {
  correlationIdForSystemIssue,
  createIssueReporter,
  type IssueReporter,
} from "./issue-reporter.js";

interface BrainServerOptions {
  config?: BrainConfig;
  provider?: FakeAiProvider;
  interactionLog?: InteractionLog;
  issueReporter?: IssueReporter;
}

export function createBrainServer(options: BrainServerOptions = {}) {
  const config = options.config ? validateConfig(options.config) : loadConfig();
  const provider = options.provider ?? new FakeAiProvider();
  const interactionLog = options.interactionLog ?? new InteractionLog(config.dataDir);
  const issueReporter = options.issueReporter ?? createIssueReporter(config.discordWebhookUrl);
  const app = express();
  const server = http.createServer(app);
  const events = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();

  app.use((_request, response, next) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    next();
  });
  app.options(/.*/, (_request, response) => {
    response.sendStatus(204);
  });
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
      interactionLog.recordPromptRequest(promptExchangeId, promptRequest);

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
        interactionLog,
        provider,
        issueReporter,
        publish: (event) => publishEvent(sockets, event),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/system-issues", async (request, response, next) => {
    try {
      const systemIssue = SystemIssueSchema.parse(request.body);
      const correlationId = correlationIdForSystemIssue(systemIssue);

      interactionLog.recordSystemIssue(systemIssue);
      await issueReporter.report({ systemIssue, correlationId });

      publishEvent(
        sockets,
        WebSocketEventSchema.parse({
          type: "system-issue.reported",
          occurredAt: new Date().toISOString(),
          payload: systemIssue,
        }),
      );

      response.status(202).json({
        systemIssueId: systemIssue.systemIssueId,
        correlationId,
        status: "reported",
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
    interactionLog,
    initialize: () => initializeBrainFiles(config.dataDir),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.close();
        }
        events.close((eventsError) => {
          if (eventsError) {
            reject(eventsError);
            return;
          }
          if (!server.listening) {
            interactionLog.close();
            resolve();
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            interactionLog.close();
            resolve();
          });
        });
      });
    },
  };
}

interface RunPromptExchangeOptions {
  deviceId: string;
  prompt: string;
  promptExchangeId: string;
  interactionLog: InteractionLog;
  provider: FakeAiProvider;
  issueReporter: IssueReporter;
  publish: (event: WebSocketEvent) => void;
}

async function runPromptExchange({
  deviceId,
  prompt,
  promptExchangeId,
  interactionLog,
  provider,
  issueReporter,
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

  try {
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
  } catch (error) {
    const occurredAt = new Date().toISOString();
    const systemIssue = createRuntimeSystemIssue({
      deviceId,
      promptExchangeId,
      occurredAt,
      error,
    });
    interactionLog.recordRuntimeError({
      correlationId: promptExchangeId,
      promptExchangeId,
      deviceId,
      occurredAt,
      error,
    });
    interactionLog.recordSystemIssue(systemIssue);
    await issueReporter.report({
      systemIssue,
      correlationId: correlationIdForSystemIssue(systemIssue),
    });
    publish(
      WebSocketEventSchema.parse({
        type: "prompt-exchange.failed",
        promptExchangeId,
        occurredAt,
        payload: {
          status: "failed",
          systemIssue,
        },
      }),
    );
    return;
  }

  const completedAt = new Date().toISOString();
  interactionLog.recordProviderResponse({
    promptExchangeId,
    deviceId,
    response,
    occurredAt: completedAt,
  });

  publish(
    WebSocketEventSchema.parse({
      type: "prompt-exchange.completed",
      promptExchangeId,
      occurredAt: completedAt,
      payload: {
        status: "completed",
        response,
      },
    }),
  );
}

function createRuntimeSystemIssue(options: {
  deviceId: string;
  promptExchangeId: string;
  occurredAt: string;
  error: unknown;
}): SystemIssue {
  return SystemIssueSchema.parse({
    systemIssueId: createSystemIssueId(),
    severity: "error",
    source: "brain-server",
    category: "runtime",
    message: options.error instanceof Error ? options.error.message : "Unknown runtime error.",
    occurredAt: options.occurredAt,
    deviceId: options.deviceId,
    promptExchangeId: options.promptExchangeId,
  });
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
  brain
    .initialize()
    .then(() => {
      brain.server.listen(brain.config.port, brain.config.host, () => {
        console.log(`Brain Server listening on http://${brain.config.host}:${brain.config.port}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
