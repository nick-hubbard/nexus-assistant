import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  installedSkillsDirForDataDir,
  SkillManifestSchema,
  skillConfigurationPath,
} from "./skill-host.js";

export { skillConfigurationPath } from "./skill-host.js";

const SkillRegistrySchema = z.record(z.string().trim().min(1), z.string().trim().min(1));

export class SkillInstallError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid-package"
      | "registry-not-found"
      | "registry-entry-not-found"
      | "install-failed",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SkillInstallError";
  }
}

export interface InstallSkillOptions {
  dataDir: string;
  registryPath?: string;
  gitCommand?: string;
}

export interface InstalledSkillPackage {
  id: string;
  packagePath: string;
}

export async function installSkill(
  skill: string,
  options: InstallSkillOptions,
): Promise<InstalledSkillPackage> {
  const resolvedSource = await resolveSkillSource(skill, options);
  const packagePath = await materializePackage(resolvedSource, options);
  const manifest = await readSkillManifest(packagePath);
  await assertEntrypointExists(packagePath, manifest.entrypoint, manifest.id);

  const destination = path.join(installedSkillsDirForDataDir(options.dataDir), manifest.id);
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(destination, { force: true, recursive: true });
  await cp(packagePath, destination, { recursive: true });

  return {
    id: manifest.id,
    packagePath: destination,
  };
}

export async function configureSkill(
  skillId: string,
  configuration: Record<string, unknown>,
  options: { dataDir: string },
) {
  const configurationPath = skillConfigurationPath(options.dataDir, skillId);
  await mkdir(path.dirname(configurationPath), { recursive: true });
  await writeFile(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`);

  return configurationPath;
}

export function defaultSkillRegistryPath(dataDir: string) {
  return path.join(dataDir, "skill-registry.json");
}

async function resolveSkillSource(skill: string, options: InstallSkillOptions) {
  if (await pathExists(skill)) {
    return path.resolve(skill);
  }

  const registryPath = options.registryPath ?? defaultSkillRegistryPath(options.dataDir);
  const registryJson = await readFile(registryPath, "utf8").catch((error: unknown) => {
    throw new SkillInstallError(
      `Skill Registry mapping was not found at ${registryPath}.`,
      "registry-not-found",
      error,
    );
  });

  let registryValue: unknown;
  try {
    registryValue = JSON.parse(registryJson);
  } catch (error) {
    throw new SkillInstallError(
      `Skill Registry mapping at ${registryPath} is not valid JSON.`,
      "registry-not-found",
      error,
    );
  }

  const registry = SkillRegistrySchema.safeParse(registryValue);
  if (!registry.success) {
    throw new SkillInstallError(
      `Skill Registry mapping at ${registryPath} is invalid.`,
      "registry-not-found",
      registry.error,
    );
  }

  const mappedSource = registry.data[skill];
  const resolved =
    mappedSource && !isGitSource(mappedSource) && !path.isAbsolute(mappedSource)
      ? path.resolve(path.dirname(registryPath), mappedSource)
      : mappedSource;
  if (!resolved) {
    throw new SkillInstallError(
      `Skill '${skill}' was not found in Skill Registry mapping ${registryPath}.`,
      "registry-entry-not-found",
    );
  }

  return resolved;
}

async function materializePackage(source: string, options: InstallSkillOptions) {
  if (await pathExists(source)) {
    return path.resolve(source);
  }

  if (!isGitSource(source)) {
    throw new SkillInstallError(
      `Skill source '${source}' is not a local package path or Git source.`,
      "invalid-package",
    );
  }

  const checkoutDir = await mkdtemp(path.join(tmpdir(), "open-nexus-skill-install-"));
  await runCommand(options.gitCommand ?? "git", ["clone", "--depth", "1", source, checkoutDir]);
  return checkoutDir;
}

async function readSkillManifest(packagePath: string) {
  const manifestPath = path.join(packagePath, "skill.json");
  const manifestJson = await readFile(manifestPath, "utf8").catch((error: unknown) => {
    throw new SkillInstallError(
      `Skill package at ${packagePath} does not contain a readable skill.json manifest.`,
      "invalid-package",
      error,
    );
  });

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestJson);
  } catch (error) {
    throw new SkillInstallError(
      `Skill package manifest at ${manifestPath} is not valid JSON.`,
      "invalid-package",
      error,
    );
  }

  const manifest = SkillManifestSchema.safeParse(manifestValue);
  if (!manifest.success) {
    throw new SkillInstallError(
      `Skill package manifest at ${manifestPath} does not match the Skill package contract.`,
      "invalid-package",
      manifest.error,
    );
  }

  return manifest.data;
}

async function assertEntrypointExists(packagePath: string, entrypoint: string, skillId: string) {
  const entrypointPath = path.resolve(packagePath, entrypoint);
  await access(entrypointPath).catch((error: unknown) => {
    throw new SkillInstallError(
      `Skill '${skillId}' entrypoint is missing at ${entrypointPath}.`,
      "invalid-package",
      error,
    );
  });
}

async function pathExists(value: string) {
  return access(value)
    .then(() => true)
    .catch(() => false);
}

function isGitSource(source: string) {
  return /^(https?:\/\/|ssh:\/\/|git@).+/.test(source) || source.endsWith(".git");
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new SkillInstallError(
          `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}.`,
          "install-failed",
        ),
      );
    });
  });
}
