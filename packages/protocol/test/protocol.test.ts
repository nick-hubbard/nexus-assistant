import { describe, expect, it } from "vitest";
import {
  DeviceStatusSchema,
  HealthResponseSchema,
  PromptExchangeAcceptedSchema,
  PromptExchangeIdSchema,
  PromptRequestSchema,
  SystemIssueSchema,
  WebSocketEventSchema,
} from "../src/index.js";

const now = "2026-05-17T18:45:00.000Z";
const deviceId = "dev_kitchen-display";
const promptExchangeId = "px_01HZXKITCHEN123";
const systemIssueId = "si_01HZXCONFIG123";

describe("protocol schemas", () => {
  it("accepts the HTTP-started Prompt Exchange contract", () => {
    const request = PromptRequestSchema.parse({
      deviceId,
      prompt: "What is on my calendar today?",
      requestedAt: now,
      context: {
        timezone: "America/Indiana/Indianapolis",
        locale: "en-US",
      },
    });

    const accepted = PromptExchangeAcceptedSchema.parse({
      promptExchangeId,
      status: "accepted",
      acceptedAt: now,
    });

    expect(request.prompt).toBe("What is on my calendar today?");
    expect(accepted.promptExchangeId).toBe(promptExchangeId);
  });

  it("accepts WebSocket updates for a Prompt Exchange", () => {
    const events = [
      {
        type: "prompt-exchange.started",
        promptExchangeId,
        occurredAt: now,
        payload: {
          status: "started",
          deviceId,
        },
      },
      {
        type: "prompt-exchange.delta",
        promptExchangeId,
        occurredAt: now,
        payload: {
          status: "streaming",
          delta: "Today",
          sequence: 0,
        },
      },
      {
        type: "prompt-exchange.completed",
        promptExchangeId,
        occurredAt: now,
        payload: {
          status: "completed",
          response: "Today is clear.",
        },
      },
    ];

    expect(events.map((event) => WebSocketEventSchema.parse(event).type)).toEqual([
      "prompt-exchange.started",
      "prompt-exchange.delta",
      "prompt-exchange.completed",
    ]);
  });

  it("accepts device status and System Issue events", () => {
    const deviceStatus = DeviceStatusSchema.parse({
      deviceId,
      state: "busy",
      lastSeenAt: now,
      activePromptExchangeId: promptExchangeId,
      batteryPercent: 91,
      kiosk: {
        fullscreen: true,
        startedAt: now,
      },
    });

    const systemIssue = SystemIssueSchema.parse({
      systemIssueId,
      severity: "error",
      source: "ai-provider",
      category: "provider",
      message: "Subscription Provider session expired.",
      occurredAt: now,
      deviceId,
      promptExchangeId,
      details: {
        provider: "openai-codex",
      },
    });

    expect(
      WebSocketEventSchema.parse({
        type: "device-status.updated",
        occurredAt: now,
        payload: deviceStatus,
      }).type,
    ).toBe("device-status.updated");

    expect(
      WebSocketEventSchema.parse({
        type: "system-issue.reported",
        occurredAt: now,
        payload: systemIssue,
      }).type,
    ).toBe("system-issue.reported");
  });

  it("accepts device display messages", () => {
    const event = WebSocketEventSchema.parse({
      type: "device-message.displayed",
      occurredAt: now,
      payload: {
        messageId: "dm_01HZXMORNING123",
        title: "Good morning",
        message: "Start where you are. Use what you have. Do what you can.",
        variant: "inspiration",
        deviceId,
      },
    });

    expect(event.type).toBe("device-message.displayed");
  });

  it("rejects invalid protocol payloads", () => {
    expect(() => PromptExchangeIdSchema.parse("not-a-prompt-exchange-id")).toThrow();
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "device-ui",
        version: "0.1.0",
        checkedAt: now,
      }),
    ).toThrow();
    expect(() =>
      PromptRequestSchema.parse({
        deviceId,
        prompt: "",
        requestedAt: now,
      }),
    ).toThrow();
    expect(() =>
      WebSocketEventSchema.parse({
        type: "prompt-exchange.delta",
        promptExchangeId,
        occurredAt: now,
        payload: {
          status: "streaming",
          delta: "",
          sequence: -1,
        },
      }),
    ).toThrow();
    expect(() =>
      SystemIssueSchema.parse({
        systemIssueId,
        severity: "fatal",
        source: "device-ui",
        category: "assistant-answer-quality",
        message: "Weak answer.",
        occurredAt: now,
      }),
    ).toThrow();
  });
});
