import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installedSkillsDirForDataDir, type SkillManifest } from "../src/skill-host.js";
import {
  configureSkill,
  installSkill,
  SkillInstallError,
  skillConfigurationPath,
} from "../src/skill-installer.js";

describe("Skill installer", () => {
  it("installs a local Skill package where the Skill Host can discover it", async () => {
    const dataDir = await createDataDir();
    const packagePath = await writeSkillPackage("fake-light-skill");

    const installed = await installSkill(packagePath, { dataDir });

    expect(installed).toEqual({
      id: "fake-light-skill",
      packagePath: path.join(installedSkillsDirForDataDir(dataDir), "fake-light-skill"),
    });
    await expect(
      readFile(path.join(installed.packagePath, "skill.json"), "utf8"),
    ).resolves.toContain("fake-light-skill");
  });

  it("resolves a Skill Registry mapping before installing", async () => {
    const dataDir = await createDataDir();
    const packagePath = await writeSkillPackage("registry-light-skill");
    const registryDir = await mkdtemp(path.join(tmpdir(), "open-nexus-skill-registry-"));
    const registryPath = path.join(registryDir, "skill-registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({ lights: path.relative(registryDir, packagePath) }),
    );

    const installed = await installSkill("lights", { dataDir, registryPath });

    expect(installed.id).toBe("registry-light-skill");
    await expect(
      readFile(
        path.join(installedSkillsDirForDataDir(dataDir), "registry-light-skill", "adapter.js"),
        "utf8",
      ),
    ).resolves.toContain("export default");
  });

  it("stores Brain-owned Skill Configuration separately from the package", async () => {
    const dataDir = await createDataDir();
    const packagePath = await writeSkillPackage("configured-light-skill");
    await installSkill(packagePath, { dataDir });

    const configurationPath = await configureSkill(
      "configured-light-skill",
      { baseUrl: "http://homeassistant.local:8123", token: "secret" },
      { dataDir },
    );

    expect(configurationPath).toBe(skillConfigurationPath(dataDir, "configured-light-skill"));
    await expect(readFile(configurationPath, "utf8")).resolves.toBe(
      `${JSON.stringify(
        { baseUrl: "http://homeassistant.local:8123", token: "secret" },
        null,
        2,
      )}\n`,
    );
    await expect(
      readFile(
        path.join(installedSkillsDirForDataDir(dataDir), "configured-light-skill", "skill.json"),
        "utf8",
      ),
    ).resolves.not.toContain("secret");
  });

  it("rejects packages without a valid Skill Manifest", async () => {
    const dataDir = await createDataDir();
    const packagePath = await mkdtemp(path.join(tmpdir(), "open-nexus-invalid-skill-"));
    await writeFile(path.join(packagePath, "skill.json"), JSON.stringify({ id: "broken skill" }));

    await expect(installSkill(packagePath, { dataDir })).rejects.toMatchObject({
      code: "invalid-package",
    });
    await expect(installSkill(packagePath, { dataDir })).rejects.toBeInstanceOf(SkillInstallError);
  });
});

async function createDataDir() {
  return mkdtemp(path.join(tmpdir(), "open-nexus-skill-installer-"));
}

async function writeSkillPackage(skillId: string) {
  const packagePath = await mkdtemp(path.join(tmpdir(), `open-nexus-${skillId}-`));
  await writeFile(
    path.join(packagePath, "skill.json"),
    JSON.stringify(validManifest({ id: skillId })),
  );
  await writeFile(
    path.join(packagePath, "adapter.js"),
    "export default { invoke: () => ({ status: 'succeeded' }) };",
  );
  return packagePath;
}

function validManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    id: "fake-light-skill",
    name: "Fake Light Skill",
    version: "0.1.0",
    entrypoint: "./adapter.js",
    capabilities: [
      {
        id: "lights.control",
        title: "Control lights",
        description: "Turns lights on and off.",
        actions: ["turn-on", "turn-off"],
        examples: ["turn off the kitchen lights"],
      },
    ],
    configurationSchema: {
      type: "object",
      required: ["baseUrl"],
      properties: {
        baseUrl: { type: "string" },
      },
    },
    safetyDefaults: {
      confirmation: "not-required",
      disabledActions: [],
    },
    ...overrides,
  };
}
