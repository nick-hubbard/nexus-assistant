import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const JsonSchemaObject = z.record(z.string(), z.unknown());

export const SkillManifestSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/, "Skill Manifest identity must be a lowercase slug."),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    entrypoint: z.string().trim().min(1),
    capabilities: z
      .array(
        z
          .object({
            id: z
              .string()
              .trim()
              .regex(/^[a-z][a-z0-9._-]{1,126}[a-z0-9]$/),
            title: z.string().trim().min(1),
            description: z.string().trim().min(1),
            actions: z.array(z.string().trim().min(1)).default([]),
            examples: z.array(z.string().trim().min(1)).default([]),
          })
          .strict(),
      )
      .min(1),
    configurationSchema: JsonSchemaObject,
    safetyDefaults: z
      .object({
        confirmation: z.enum(["not-required", "required"]).default("not-required"),
        disabledActions: z.array(z.string().trim().min(1)).default([]),
      })
      .strict()
      .default({ confirmation: "not-required", disabledActions: [] }),
  })
  .strict();

export const SkillActionResultSchema = z
  .object({
    status: z.enum(["succeeded", "failed", "refused"]),
    responseText: z.string().trim().min(1).optional(),
    data: z.unknown().optional(),
    error: z
      .object({
        message: z.string().trim().min(1),
        code: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SkillManifest = z.infer<typeof SkillManifestSchema>;
export type SkillActionResult = z.infer<typeof SkillActionResultSchema>;

export interface SkillActionRequest {
  action: string;
  input: unknown;
  configuration?: unknown;
}

export interface SkillAdapter {
  invoke(request: SkillActionRequest): Promise<SkillActionResult> | SkillActionResult;
}

export interface InstalledSkill {
  manifest: SkillManifest;
  packagePath: string;
}

export type SkillAdapterLoader = (
  entrypointPath: string,
  manifest: SkillManifest,
) => Promise<SkillAdapter>;

export class SkillHostError extends Error {
  constructor(
    message: string,
    readonly code: "invalid-manifest" | "missing-entrypoint" | "skill-not-found" | "load-failed",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SkillHostError";
  }
}

export class SkillHost {
  private readonly installedSkillsDir: string;
  private readonly dataDir: string;
  private readonly loadAdapter: SkillAdapterLoader;

  constructor(options: { dataDir: string; loadAdapter?: SkillAdapterLoader }) {
    this.dataDir = options.dataDir;
    this.installedSkillsDir = installedSkillsDirForDataDir(options.dataDir);
    this.loadAdapter = options.loadAdapter ?? loadInProcessAdapter;
  }

  async discover(): Promise<InstalledSkill[]> {
    const packageNames = await readdir(this.installedSkillsDir).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    });

    const skills = await Promise.all(
      packageNames.map((packageName) =>
        this.readInstalledSkill(path.join(this.installedSkillsDir, packageName)),
      ),
    );

    return skills.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
  }

  async invoke(skillId: string, request: SkillActionRequest): Promise<SkillActionResult> {
    const skill = (await this.discover()).find(
      (installedSkill) => installedSkill.manifest.id === skillId,
    );

    if (!skill) {
      throw new SkillHostError(`Skill '${skillId}' is not installed.`, "skill-not-found");
    }

    const entrypointPath = path.resolve(skill.packagePath, skill.manifest.entrypoint);
    await assertEntrypointExists(entrypointPath, skill.manifest.id);
    const adapter = await this.loadAdapter(entrypointPath, skill.manifest);
    const result = await adapter.invoke({
      ...request,
      configuration:
        request.configuration ?? (await readSkillConfiguration(this.dataDir, skill.manifest.id)),
    });

    return SkillActionResultSchema.parse(result);
  }

  private async readInstalledSkill(packagePath: string): Promise<InstalledSkill> {
    const manifestPath = path.join(packagePath, "skill.json");
    const manifestJson = await readFile(manifestPath, "utf8").catch((error: unknown) => {
      throw new SkillHostError(
        `Unable to read Skill Manifest at ${manifestPath}.`,
        "invalid-manifest",
        error,
      );
    });

    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(manifestJson);
    } catch (error) {
      throw new SkillHostError(
        `Skill Manifest at ${manifestPath} is not valid JSON.`,
        "invalid-manifest",
        error,
      );
    }

    const manifest = SkillManifestSchema.safeParse(manifestValue);
    if (!manifest.success) {
      throw new SkillHostError(
        `Skill Manifest at ${manifestPath} does not match the Skill package contract.`,
        "invalid-manifest",
        manifest.error,
      );
    }

    return {
      manifest: manifest.data,
      packagePath,
    };
  }
}

export function installedSkillsDirForDataDir(dataDir: string) {
  return path.join(dataDir, "installed-skills");
}

export function skillConfigurationPath(dataDir: string, skillId: string) {
  return path.join(dataDir, "skill-configurations", `${skillId}.json`);
}

async function assertEntrypointExists(entrypointPath: string, skillId: string) {
  await access(entrypointPath).catch((error: unknown) => {
    throw new SkillHostError(
      `Skill '${skillId}' entrypoint is missing at ${entrypointPath}.`,
      "missing-entrypoint",
      error,
    );
  });
}

async function loadInProcessAdapter(entrypointPath: string): Promise<SkillAdapter> {
  const module = (await import(pathToFileURL(entrypointPath).href)) as {
    default?: unknown;
    skill?: unknown;
  };
  const adapter = module.default ?? module.skill;

  if (!isSkillAdapter(adapter)) {
    throw new SkillHostError(
      `Skill entrypoint at ${entrypointPath} did not export a Skill adapter.`,
      "load-failed",
    );
  }

  return adapter;
}

function isSkillAdapter(value: unknown): value is SkillAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    "invoke" in value &&
    typeof value.invoke === "function"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function readSkillConfiguration(dataDir: string, skillId: string) {
  const configurationJson = await readFile(skillConfigurationPath(dataDir, skillId), "utf8").catch(
    (error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    },
  );

  return configurationJson === undefined ? undefined : JSON.parse(configurationJson);
}
