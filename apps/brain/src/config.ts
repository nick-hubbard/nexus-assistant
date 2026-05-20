import { z } from "zod";

const ConfigSchema = z
  .object({
    port: z.coerce.number().int().min(0).max(65535),
    host: z.string().min(1),
    version: z.string().min(1),
    provider: z.enum(["fake", "openai-codex"]),
    dataDir: z.string().min(1),
    codexCommand: z.string().min(1),
    codexArgs: z.array(z.string()),
    codexTimeoutMs: z.coerce.number().int().positive(),
    heartbeatEnabled: z.coerce.boolean(),
    heartbeatPollMs: z.coerce.number().int().positive(),
    discordWebhookUrl: z.string().url().optional(),
  })
  .strict();

export type BrainConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BrainConfig {
  return validateConfig({
    port: env.BRAIN_PORT ?? 4317,
    host: env.BRAIN_HOST ?? "127.0.0.1",
    version: env.BRAIN_VERSION ?? "0.1.0",
    provider: env.BRAIN_AI_PROVIDER ?? "fake",
    dataDir: env.BRAIN_DATA_DIR ?? "./data/brain",
    codexCommand: env.BRAIN_CODEX_COMMAND ?? "codex",
    codexArgs: parseCodexArgs(env.BRAIN_CODEX_ARGS ?? "exec"),
    codexTimeoutMs: env.BRAIN_CODEX_TIMEOUT_MS ?? 120000,
    heartbeatEnabled: env.BRAIN_HEARTBEAT_ENABLED ?? true,
    heartbeatPollMs: env.BRAIN_HEARTBEAT_POLL_MS ?? 60000,
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
  });
}

export function validateConfig(config: unknown): BrainConfig {
  return ConfigSchema.parse(config);
}

function parseCodexArgs(value: string) {
  const trimmed = value.trim();

  return trimmed ? trimmed.split(/\s+/) : [];
}
