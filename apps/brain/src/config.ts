import { z } from "zod";

const ConfigSchema = z
  .object({
    port: z.coerce.number().int().min(0).max(65535),
    host: z.string().min(1),
    version: z.string().min(1),
    provider: z.enum(["fake", "openai-codex", "openai-api"]),
    dataDir: z.string().min(1),
    codexCommand: z.string().min(1),
    codexArgs: z.array(z.string()),
    codexTimeoutMs: z.coerce.number().int().positive(),
    openaiApiKey: z.string().min(1).optional(),
    openaiBaseUrl: z.string().url(),
    openaiModel: z.string().min(1),
    openaiTimeoutMs: z.coerce.number().int().positive(),
    openaiReasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]),
    openaiVerbosity: z.enum(["low", "medium", "high"]),
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
    codexArgs: parseCodexArgs(env.BRAIN_CODEX_ARGS ?? "exec --ephemeral"),
    codexTimeoutMs: env.BRAIN_CODEX_TIMEOUT_MS ?? 120000,
    openaiApiKey: env.BRAIN_OPENAI_API_KEY || env.OPENAI_API_KEY || undefined,
    openaiBaseUrl: env.BRAIN_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiModel: env.BRAIN_OPENAI_MODEL ?? "gpt-5.5",
    openaiTimeoutMs: env.BRAIN_OPENAI_TIMEOUT_MS ?? 30000,
    openaiReasoningEffort: env.BRAIN_OPENAI_REASONING_EFFORT ?? "low",
    openaiVerbosity: env.BRAIN_OPENAI_VERBOSITY ?? "low",
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
