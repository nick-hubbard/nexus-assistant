import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PromptExchangeAcceptedSchema,
  type WebSocketEvent,
  WebSocketEventSchema,
} from "@open-nexus/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { BrainConfig } from "../src/config.js";
import { createBrainServer } from "../src/index.js";
import type { IssueReport, IssueReporter } from "../src/issue-reporter.js";

const openServers: Array<ReturnType<typeof createBrainServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((brain) => brain.close()));
});

describe("Brain Server", () => {
  it("initializes Brain Files without overwriting existing edits", async () => {
    const dataDir = await createDataDir();
    const memoryPath = path.join(dataDir, "MEMORY.md");
    await writeFile(memoryPath, "# Memory\n\nUser-authored memory.\n");

    const brain = createBrainServer({
      config: createTestConfig({ dataDir }),
    });
    openServers.push(brain);

    await brain.initialize();

    await expect(readFile(path.join(dataDir, "IDENTITY.md"), "utf8")).resolves.toContain(
      "# Identity",
    );
    await expect(readFile(memoryPath, "utf8")).resolves.toBe("# Memory\n\nUser-authored memory.\n");
    await expect(readFile(path.join(dataDir, "INSTRUCTIONS.md"), "utf8")).resolves.toContain(
      "# Instructions",
    );
  });

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

  it("allows browser prompt submissions from the Device UI", async () => {
    const brain = await startBrainServer();

    const response = await fetch(`${baseUrl(brain)}/prompts`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("starts a Prompt Exchange over HTTP and publishes deterministic WebSocket events", async () => {
    const issueReporter = new FakeIssueReporter();
    const brain = await startBrainServer({ issueReporter });
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

    const loggedEvents = brain.interactionLog.allEvents();
    expect(loggedEvents.map((event) => event.type)).toEqual([
      "prompt.requested",
      "provider.response",
    ]);
    expect(loggedEvents.every((event) => event.correlation_id === accepted.promptExchangeId)).toBe(
      true,
    );
    expect(JSON.parse(String(loggedEvents[0]?.payload_json))).toMatchObject({
      deviceId: "dev_kitchen-display",
      prompt: "What is next?",
    });
    expect(JSON.parse(String(loggedEvents[1]?.payload_json))).toMatchObject({
      response: "Fake provider response: What is next?",
    });
    expect(issueReporter.reports).toEqual([]);
  });

  it("records and reports System Issues from the Device UI", async () => {
    const issueReporter = new FakeIssueReporter();
    const brain = await startBrainServer({ issueReporter });
    const socket = await connectEvents(brain);
    const messages = collectMessages(socket, 1);

    const systemIssue = {
      systemIssueId: "si_deviceoffline0001",
      severity: "error",
      source: "device-ui",
      category: "connectivity",
      message: "Device UI lost contact with the Brain Server.",
      occurredAt: new Date().toISOString(),
      deviceId: "dev_kitchen-display",
    };
    const response = await fetch(`${baseUrl(brain)}/system-issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(systemIssue),
    });

    const body = await response.json();
    const events = await messages;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      systemIssueId: systemIssue.systemIssueId,
      correlationId: systemIssue.systemIssueId,
      status: "reported",
    });
    expect(issueReporter.reports).toEqual([
      {
        correlationId: systemIssue.systemIssueId,
        systemIssue,
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "system-issue.reported",
      payload: systemIssue,
    });

    const loggedEvents = brain.interactionLog.allEvents();
    expect(loggedEvents.map((event) => event.type)).toEqual(["system-issue.reported"]);
    expect(loggedEvents[0]?.correlation_id).toBe(systemIssue.systemIssueId);
    expect(JSON.parse(String(loggedEvents[0]?.payload_json))).toMatchObject(systemIssue);
  });

  it("validates configuration at startup", () => {
    expect(() =>
      createBrainServer({
        config: {
          port: 70000,
          host: "127.0.0.1",
          version: "test-version",
          provider: "fake",
          dataDir: "./data/test",
        },
      }),
    ).toThrow();
  });
});

async function startBrainServer(options: { issueReporter?: IssueReporter } = {}) {
  const brain = createBrainServer({
    config: createTestConfig({ dataDir: await createDataDir() }),
    ...(options.issueReporter ? { issueReporter: options.issueReporter } : {}),
  });

  await brain.initialize();
  await new Promise<void>((resolve) => brain.server.listen(0, "127.0.0.1", resolve));
  openServers.push(brain);
  return brain;
}

function createTestConfig(overrides: Partial<BrainConfig>) {
  return {
    port: 0,
    host: "127.0.0.1",
    version: "test-version",
    provider: "fake" as const,
    dataDir: "./data/test",
    ...overrides,
  };
}

async function createDataDir() {
  return mkdtemp(path.join(tmpdir(), "open-nexus-brain-"));
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

class FakeIssueReporter implements IssueReporter {
  readonly reports: IssueReport[] = [];

  async report(issueReport: IssueReport) {
    this.reports.push(issueReport);
  }
}
