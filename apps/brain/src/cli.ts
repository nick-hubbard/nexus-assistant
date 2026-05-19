#!/usr/bin/env tsx
import "dotenv/config";
import { loadConfig } from "./config.js";
import { configureSkill, installSkill } from "./skill-installer.js";

interface CliOptions {
  dataDir?: string;
  registryPath?: string;
}

async function main(argv: string[]) {
  const { args, options } = parseGlobalOptions(argv);
  const [command, ...rest] = args;
  const dataDir = options.dataDir ?? loadConfig().dataDir;

  if (command === "install") {
    const [skill] = rest;
    if (!skill) {
      throw new Error("Usage: nexus install <skill> [--data-dir <path>] [--registry <path>]");
    }

    const installOptions = {
      dataDir,
      ...(options.registryPath ? { registryPath: options.registryPath } : {}),
    };
    const installed = await installSkill(skill, installOptions);
    console.log(`Installed Skill '${installed.id}' to ${installed.packagePath}`);
    return;
  }

  if (command === "skills" && rest[0] === "configure") {
    const skillId = rest[1];
    if (!skillId) {
      throw new Error("Usage: nexus skills configure <skill> [--json <object>] [--set key=value]");
    }

    const configuration = parseConfiguration(rest.slice(2));
    const configurationPath = await configureSkill(skillId, configuration, { dataDir });
    console.log(`Stored Skill Configuration for '${skillId}' at ${configurationPath}`);
    return;
  }

  throw new Error(
    [
      "Usage:",
      "  nexus install <skill> [--data-dir <path>] [--registry <path>]",
      "  nexus skills configure <skill> [--data-dir <path>] [--json <object>] [--set key=value]",
    ].join("\n"),
  );
}

function parseGlobalOptions(argv: string[]) {
  const args: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) {
      continue;
    }
    if (value === "--data-dir") {
      index += 1;
      options.dataDir = requireValue(argv, index, value);
    } else if (value === "--registry") {
      index += 1;
      options.registryPath = requireValue(argv, index, value);
    } else {
      args.push(value);
    }
  }

  return { args, options };
}

function parseConfiguration(args: string[]) {
  const configuration: Record<string, unknown> = {};

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") {
      index += 1;
      const json = requireValue(args, index, value);
      const parsed: unknown = JSON.parse(json);
      if (!isRecord(parsed)) {
        throw new Error("--json must be a JSON object.");
      }
      Object.assign(configuration, parsed);
    } else if (value === "--set") {
      index += 1;
      const assignment = requireValue(args, index, value);
      const separator = assignment.indexOf("=");
      if (separator <= 0) {
        throw new Error("--set values must use key=value syntax.");
      }
      configuration[assignment.slice(0, separator)] = parseScalar(assignment.slice(separator + 1));
    } else {
      throw new Error(`Unknown configure option '${value}'.`);
    }
  }

  return configuration;
}

function parseScalar(value: string) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}

function requireValue(values: string[], index: number, option: string) {
  const value = values[index];
  if (!value) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Nexus CLI failed.");
  process.exitCode = 1;
});
