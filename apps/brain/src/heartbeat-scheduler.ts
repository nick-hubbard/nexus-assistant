import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createPromptExchangeId } from "./ids.js";
import type { InteractionLog } from "./interaction-log.js";
import type { SkillHost } from "./skill-host.js";

const ScheduleSchema = z.union([
  z
    .object({
      every: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      cron: z.string().trim().min(1),
      timezone: z.string().trim().min(1).optional(),
    })
    .strict(),
]);

const HeartbeatTaskSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/),
    name: z.string().trim().min(1),
    schedule: ScheduleSchema,
    skillId: z.string().trim().min(1),
    action: z.string().trim().min(1),
    input: z.unknown().optional(),
    deviceId: z
      .string()
      .trim()
      .regex(/^dev_[a-zA-Z0-9_-]{8,64}$/)
      .optional(),
    enabled: z.boolean().default(true),
  })
  .strict();

const HeartbeatTaskListSchema = z.array(HeartbeatTaskSchema);

const HeartbeatStateSchema = z
  .object({
    tasks: z.record(
      z.string(),
      z
        .object({
          lastRunAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict()
  .default({ tasks: {} });

export type HeartbeatTask = z.infer<typeof HeartbeatTaskSchema>;

export interface HeartbeatRun {
  taskId: string;
  status: "succeeded" | "failed" | "refused" | "skipped";
  responseText?: string;
  reason?: string;
}

export class HeartbeatScheduler {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly options: {
      dataDir: string;
      skillHost: SkillHost;
      interactionLog: InteractionLog;
      pollMs?: number;
      now?: () => Date;
    },
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runDueTasks();
    }, this.options.pollMs ?? 60_000);
    this.timer.unref();
    void this.runDueTasks();
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runDueTasks(): Promise<HeartbeatRun[]> {
    const tasks = await readHeartbeatTasks(this.options.dataDir);
    const state = await readHeartbeatState(this.options.dataDir);
    const now = this.now();
    const runs: HeartbeatRun[] = [];

    for (const task of tasks) {
      if (!task.enabled) {
        continue;
      }
      const lastRunAtValue = state.tasks[task.id]?.lastRunAt;
      const lastRunAt = lastRunAtValue ? new Date(lastRunAtValue) : undefined;
      if (!isTaskDue(task, now, lastRunAt)) {
        continue;
      }

      const promptExchangeId = createPromptExchangeId();
      const result = await this.options.skillHost.invoke(task.skillId, {
        action: task.action,
        input: task.input,
      });
      this.options.interactionLog.recordSkillInvocation({
        promptExchangeId,
        deviceId: task.deviceId ?? "dev_heartbeat-system",
        skillId: task.skillId,
        action: task.action,
        status: result.status,
        input: task.input,
        ...(result.responseText === undefined ? {} : { responseText: result.responseText }),
        ...(result.error === undefined ? {} : { error: result.error }),
      });

      state.tasks[task.id] = { lastRunAt: now.toISOString() };
      await writeHeartbeatState(this.options.dataDir, state);
      runs.push({
        taskId: task.id,
        status: result.status,
        ...(result.responseText === undefined ? {} : { responseText: result.responseText }),
      });
    }

    return runs;
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }
}

export async function readHeartbeatTasks(dataDir: string): Promise<HeartbeatTask[]> {
  const content = await readFile(heartbeatFilePath(dataDir), "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  const json = extractHeartbeatJson(content);
  if (!json) {
    return [];
  }
  return HeartbeatTaskListSchema.parse(JSON.parse(json));
}

export function isTaskDue(task: HeartbeatTask, now: Date, lastRunAt: Date | undefined) {
  if ("every" in task.schedule) {
    return (
      !lastRunAt || now.getTime() - lastRunAt.getTime() >= parseDurationMs(task.schedule.every)
    );
  }
  return isCronDue(task.schedule.cron, now, lastRunAt);
}

function extractHeartbeatJson(content: string) {
  const match = content.match(/```nexus-heartbeat\s*([\s\S]*?)```/);
  return match?.[1]?.trim();
}

function parseDurationMs(value: string) {
  const match = value.trim().match(/^(\d+)\s*(m|h|d)$/);
  if (!match) {
    throw new Error(`Unsupported heartbeat interval '${value}'. Use values like 30m, 2h, or 1d.`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") {
    return amount * 60_000;
  }
  if (unit === "h") {
    return amount * 60 * 60_000;
  }
  return amount * 24 * 60 * 60_000;
}

function isCronDue(cron: string, now: Date, lastRunAt: Date | undefined) {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Unsupported cron schedule '${cron}'. Use five-field cron syntax.`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const matched =
    matchesCronField(minute, now.getMinutes()) &&
    matchesCronField(hour, now.getHours()) &&
    matchesCronField(dayOfMonth, now.getDate()) &&
    matchesCronField(month, now.getMonth() + 1) &&
    matchesCronField(dayOfWeek, now.getDay());

  if (!matched) {
    return false;
  }
  if (!lastRunAt) {
    return true;
  }
  return now.getTime() - lastRunAt.getTime() >= 60_000;
}

function matchesCronField(field: string | undefined, value: number) {
  if (!field || field === "*") {
    return true;
  }
  return field.split(",").some((part) => Number(part) === value);
}

async function readHeartbeatState(dataDir: string) {
  const stateJson = await readFile(heartbeatStatePath(dataDir), "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return JSON.stringify({ tasks: {} });
    }
    throw error;
  });
  return HeartbeatStateSchema.parse(JSON.parse(stateJson));
}

async function writeHeartbeatState(dataDir: string, state: z.infer<typeof HeartbeatStateSchema>) {
  await writeFile(heartbeatStatePath(dataDir), `${JSON.stringify(state, null, 2)}\n`);
}

function heartbeatFilePath(dataDir: string) {
  return path.join(dataDir, "HEARTBEAT.md");
}

function heartbeatStatePath(dataDir: string) {
  return path.join(dataDir, "heartbeat-state.json");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
