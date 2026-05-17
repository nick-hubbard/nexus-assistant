import type { AddressInfo } from "node:net";
import {
  PromptExchangeAcceptedSchema,
  type WebSocketEvent,
  WebSocketEventSchema,
} from "@open-nexus/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createBrainServer } from "../src/index.js";

const openServers: Array<ReturnType<typeof createBrainServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((brain) => brain.close()));
});

describe("Brain Server", () => {
  it("exposes a health response", async () => {
    const brain = await startBrainServer();

    const response = await fetch(`${baseUrl(brain)}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      service: "brain-server",
      version: "test-version",
    });
  });

  it("starts a Prompt Exchange over HTTP and publishes deterministic WebSocket events", async () => {
    const brain = await startBrainServer();
    const socket = await connectEvents(brain);
    const messages = collectMessages(socket, 4);

    const response = await fetch(`${baseUrl(brain)}/prompts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deviceId: "dev_kitchen-display",
        prompt: "What is next?",
        requestedAt: new Date().toISOString(),
      }),
    });

    const accepted = PromptExchangeAcceptedSchema.parse(await response.json());
    const events = await messages;

    expect(response.status).toBe(202);
    expect(accepted.status).toBe("accepted");
    expect(events.map((event) => event.type)).toEqual([
      "prompt-exchange.started",
      "prompt-exchange.delta",
      "prompt-exchange.delta",
      "prompt-exchange.completed",
    ]);
    expect(
      events.every(
        (event) =>
          "promptExchangeId" in event && event.promptExchangeId === accepted.promptExchangeId,
      ),
    ).toBe(true);
    expect(events[1]?.payload).toMatchObject({
      status: "streaming",
      delta: "Fake provider response: ",
      sequence: 0,
    });
    expect(events.at(-1)?.payload).toMatchObject({
      status: "completed",
      response: "Fake provider response: What is next?",
    });
  });

  it("validates configuration at startup", () => {
    expect(() =>
      createBrainServer({
        config: {
          port: 70000,
          host: "127.0.0.1",
          version: "test-version",
          provider: "fake",
        },
      }),
    ).toThrow();
  });
});

async function startBrainServer() {
  const brain = createBrainServer({
    config: {
      port: 0,
      host: "127.0.0.1",
      version: "test-version",
      provider: "fake",
    },
  });

  await new Promise<void>((resolve) => brain.server.listen(0, "127.0.0.1", resolve));
  openServers.push(brain);
  return brain;
}

function baseUrl(brain: ReturnType<typeof createBrainServer>) {
  const address = brain.server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function connectEvents(brain: ReturnType<typeof createBrainServer>) {
  const socket = new WebSocket(`${baseUrl(brain).replace("http", "ws")}/events`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

function collectMessages(socket: WebSocket, count: number) {
  return new Promise<WebSocketEvent[]>((resolve, reject) => {
    const events: WebSocketEvent[] = [];
    socket.on("message", (message) => {
      events.push(WebSocketEventSchema.parse(JSON.parse(message.toString())));
      if (events.length === count) {
        resolve(events);
        socket.close();
      }
    });
    socket.once("error", reject);
  });
}
