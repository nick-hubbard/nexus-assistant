import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PromptRequest, SystemIssue } from "@open-nexus/protocol";
import Database from "better-sqlite3";

export type InteractionLogEventType =
  | "prompt.requested"
  | "provider.response"
  | "system-issue.reported"
  | "runtime.error";

export interface InteractionLogEntry {
  correlationId: string;
  promptExchangeId?: string | undefined;
  deviceId?: string | undefined;
  type: InteractionLogEventType;
  occurredAt?: string | undefined;
  payload: unknown;
}

export class InteractionLog {
  readonly databasePath: string;
  private readonly database: Database.Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.databasePath = path.join(dataDir, "interaction-logs.sqlite");
    this.database = new Database(this.databasePath);
    this.migrate();
  }

  recordPromptRequest(promptExchangeId: string, promptRequest: PromptRequest) {
    this.record({
      correlationId: promptExchangeId,
      promptExchangeId,
      deviceId: promptRequest.deviceId,
      type: "prompt.requested",
      occurredAt: promptRequest.requestedAt,
      payload: promptRequest,
    });
  }

  recordProviderResponse(options: {
    promptExchangeId: string;
    deviceId: string;
    response: string;
    occurredAt?: string;
  }) {
    this.record({
      correlationId: options.promptExchangeId,
      promptExchangeId: options.promptExchangeId,
      deviceId: options.deviceId,
      type: "provider.response",
      occurredAt: options.occurredAt,
      payload: { response: options.response },
    });
  }

  recordSystemIssue(systemIssue: SystemIssue) {
    this.record({
      correlationId: systemIssue.promptExchangeId ?? systemIssue.systemIssueId,
      promptExchangeId: systemIssue.promptExchangeId,
      deviceId: systemIssue.deviceId,
      type: "system-issue.reported",
      occurredAt: systemIssue.occurredAt,
      payload: systemIssue,
    });
  }

  recordRuntimeError(options: {
    correlationId: string;
    promptExchangeId?: string;
    deviceId?: string;
    occurredAt?: string;
    error: unknown;
  }) {
    this.record({
      correlationId: options.correlationId,
      promptExchangeId: options.promptExchangeId,
      deviceId: options.deviceId,
      type: "runtime.error",
      occurredAt: options.occurredAt,
      payload: {
        message: options.error instanceof Error ? options.error.message : "Unknown runtime error.",
      },
    });
  }

  record(entry: InteractionLogEntry) {
    this.database
      .prepare(`
        INSERT INTO interaction_log_events (
          correlation_id,
          prompt_exchange_id,
          device_id,
          type,
          occurred_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.correlationId,
        entry.promptExchangeId ?? null,
        entry.deviceId ?? null,
        entry.type,
        entry.occurredAt ?? new Date().toISOString(),
        JSON.stringify(entry.payload),
      );
  }

  allEvents() {
    return this.database
      .prepare("SELECT * FROM interaction_log_events ORDER BY id ASC")
      .all() as Array<Record<string, unknown>>;
  }

  close() {
    this.database.close();
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS interaction_log_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL,
        prompt_exchange_id TEXT,
        device_id TEXT,
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_interaction_log_events_correlation_id
        ON interaction_log_events (correlation_id);

      CREATE INDEX IF NOT EXISTS idx_interaction_log_events_prompt_exchange_id
        ON interaction_log_events (prompt_exchange_id);
    `);
  }
}
