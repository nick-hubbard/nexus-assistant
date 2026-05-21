import { z } from "zod";

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const PromptExchangeIdSchema = z
  .string()
  .regex(/^px_[a-zA-Z0-9_-]{12,64}$/, "Prompt Exchange IDs must start with px_.");

export const DeviceIdSchema = z
  .string()
  .regex(/^dev_[a-zA-Z0-9_-]{8,64}$/, "Device IDs must start with dev_.");

export const SystemIssueIdSchema = z
  .string()
  .regex(/^si_[a-zA-Z0-9_-]{12,64}$/, "System Issue IDs must start with si_.");

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("brain-server"),
  version: z.string().min(1),
  checkedAt: IsoDateTimeSchema,
});

export const PromptRequestSchema = z.object({
  deviceId: DeviceIdSchema,
  prompt: z.string().trim().min(1),
  requestedAt: IsoDateTimeSchema,
  context: z
    .object({
      timezone: z.string().min(1).optional(),
      locale: z.string().min(2).optional(),
    })
    .strict()
    .optional(),
});

export const PromptExchangeStatusSchema = z.enum([
  "accepted",
  "started",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);

export const PromptExchangeAcceptedSchema = z.object({
  promptExchangeId: PromptExchangeIdSchema,
  status: z.literal("accepted"),
  acceptedAt: IsoDateTimeSchema,
});

export const DeviceStatusSchema = z
  .object({
    deviceId: DeviceIdSchema,
    state: z.enum(["online", "idle", "busy", "offline"]),
    lastSeenAt: IsoDateTimeSchema,
    activePromptExchangeId: PromptExchangeIdSchema.optional(),
    batteryPercent: z.number().int().min(0).max(100).optional(),
    kiosk: z
      .object({
        fullscreen: z.boolean(),
        startedAt: IsoDateTimeSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const SystemIssueSchema = z
  .object({
    systemIssueId: SystemIssueIdSchema,
    severity: z.enum(["info", "warning", "error", "fatal"]),
    source: z.enum(["brain-server", "device-ui", "ai-provider", "issue-reporter"]),
    category: z.enum(["setup", "configuration", "connectivity", "provider", "runtime"]),
    message: z.string().trim().min(1),
    occurredAt: IsoDateTimeSchema,
    deviceId: DeviceIdSchema.optional(),
    promptExchangeId: PromptExchangeIdSchema.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const SpeakPromptExchangeResponseCommandSchema = z
  .object({
    type: z.literal("prompt-exchange-response.speak"),
    deviceId: DeviceIdSchema,
    promptExchangeId: PromptExchangeIdSchema,
    responseText: z.string().trim().min(1),
    replaceCurrent: z.literal(true),
  })
  .strict();

const PromptExchangeEventBaseSchema = z.object({
  promptExchangeId: PromptExchangeIdSchema,
  occurredAt: IsoDateTimeSchema,
});

export const PromptExchangeStartedEventSchema = PromptExchangeEventBaseSchema.extend({
  type: z.literal("prompt-exchange.started"),
  payload: z.object({
    status: z.literal("started"),
    deviceId: DeviceIdSchema,
  }),
});

export const PromptExchangeDeltaEventSchema = PromptExchangeEventBaseSchema.extend({
  type: z.literal("prompt-exchange.delta"),
  payload: z.object({
    status: z.literal("streaming"),
    delta: z.string().min(1),
    sequence: z.number().int().nonnegative(),
  }),
});

export const PromptExchangeCompletedEventSchema = PromptExchangeEventBaseSchema.extend({
  type: z.literal("prompt-exchange.completed"),
  payload: z.object({
    status: z.literal("completed"),
    response: z.string().min(1),
  }),
});

export const PromptExchangeFailedEventSchema = PromptExchangeEventBaseSchema.extend({
  type: z.literal("prompt-exchange.failed"),
  payload: z.object({
    status: z.literal("failed"),
    systemIssue: SystemIssueSchema,
  }),
});

export const DeviceStatusUpdatedEventSchema = z.object({
  type: z.literal("device-status.updated"),
  occurredAt: IsoDateTimeSchema,
  payload: DeviceStatusSchema,
});

export const DeviceMessageDisplayedEventSchema = z.object({
  type: z.literal("device-message.displayed"),
  occurredAt: IsoDateTimeSchema,
  payload: z
    .object({
      messageId: z
        .string()
        .regex(/^dm_[a-zA-Z0-9_-]{12,64}$/, "Device Message IDs must start with dm_."),
      title: z.string().trim().min(1),
      message: z.string().trim().min(1),
      variant: z.enum(["inspiration", "info"]).default("info"),
      deviceId: DeviceIdSchema.optional(),
    })
    .strict(),
});

export const SystemIssueReportedEventSchema = z.object({
  type: z.literal("system-issue.reported"),
  occurredAt: IsoDateTimeSchema,
  payload: SystemIssueSchema,
});

export const WebSocketEventSchema = z.discriminatedUnion("type", [
  PromptExchangeStartedEventSchema,
  PromptExchangeDeltaEventSchema,
  PromptExchangeCompletedEventSchema,
  PromptExchangeFailedEventSchema,
  DeviceStatusUpdatedEventSchema,
  DeviceMessageDisplayedEventSchema,
  SystemIssueReportedEventSchema,
]);

export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type PromptExchangeId = z.infer<typeof PromptExchangeIdSchema>;
export type DeviceId = z.infer<typeof DeviceIdSchema>;
export type SystemIssueId = z.infer<typeof SystemIssueIdSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export type PromptExchangeStatus = z.infer<typeof PromptExchangeStatusSchema>;
export type PromptExchangeAccepted = z.infer<typeof PromptExchangeAcceptedSchema>;
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;
export type SystemIssue = z.infer<typeof SystemIssueSchema>;
export type DeviceMessageDisplayedEvent = z.infer<typeof DeviceMessageDisplayedEventSchema>;
export type SpeakPromptExchangeResponseCommand = z.infer<
  typeof SpeakPromptExchangeResponseCommandSchema
>;
export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;
