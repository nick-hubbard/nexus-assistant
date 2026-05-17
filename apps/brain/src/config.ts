import { z } from "zod";

const ConfigSchema = z
  .object({
    port: z.coerce.number().int().min(0).max(65535),
    host: z.string().min(1),
    version: z.string().min(1),
    provider: z.literal("fake"),
    dataDir: z.string().min(1),
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
  });
}

export function validateConfig(config: unknown): BrainConfig {
  return ConfigSchema.parse(config);
}
