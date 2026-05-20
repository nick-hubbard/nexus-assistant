import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  installedSkillsDirForDataDir,
  type SkillAdapter,
  SkillHost,
  SkillHostError,
  type SkillManifest,
  skillConfigurationPath,
} from "../src/skill-host.js";

describe("Skill Host", () => {
  it("validates and discovers installed Skill Manifests without loading Skill code", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "fake-light-skill", {
      manifest: validManifest({
        id: "fake-light-skill",
        name: "Fake Light Skill",
      }),
    });
    let loadCount = 0;
    const host = new SkillHost({
      dataDir,
      loadAdapter: async () => {
        loadCount += 1;
        return fakeAdapter();
      },
    });

    const skills = await host.discover();

    expect(skills).toHaveLength(1);
    expect(skills[0]?.manifest).toMatchObject({
      id: "fake-light-skill",
      capabilities: [
        {
          id: "lights.control",
          title: "Control lights",
        },
      ],
      safetyDefaults: {
        confirmation: "not-required",
        disabledActions: [],
      },
    });
    expect(loadCount).toBe(0);
  });

  it("uses the Brain-owned installed-skills directory convention", async () => {
    const dataDir = await createDataDir();

    expect(installedSkillsDirForDataDir(dataDir)).toBe(path.join(dataDir, "installed-skills"));
    await expect(new SkillHost({ dataDir }).discover()).resolves.toEqual([]);
  });

  it("rejects invalid Skill Manifests", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "broken-skill", {
      manifest: {
        id: "broken skill",
        name: "Broken Skill",
      },
    });

    await expect(new SkillHost({ dataDir }).discover()).rejects.toMatchObject({
      code: "invalid-manifest",
    });
  });

  it("reports missing entrypoints when invoking a Skill", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "fake-light-skill", {
      manifest: validManifest({
        id: "fake-light-skill",
        entrypoint: "./missing-entrypoint.js",
      }),
    });

    await expect(
      new SkillHost({
        dataDir,
        loadAdapter: async () => fakeAdapter(),
      }).invoke("fake-light-skill", {
        action: "turn-off",
        input: { entityId: "light.kitchen" },
      }),
    ).rejects.toMatchObject({
      code: "missing-entrypoint",
    });
  });

  it("loads and invokes a fake in-process Skill adapter through the host boundary", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "fake-light-skill", {
      manifest: validManifest({
        id: "fake-light-skill",
      }),
      entrypointContents: "export default {};",
    });
    const requests: unknown[] = [];
    const host = new SkillHost({
      dataDir,
      loadAdapter: async (entrypointPath, manifest) => {
        requests.push({ entrypointPath, manifestId: manifest.id });
        return fakeAdapter({
          status: "succeeded",
          responseText: "Turned off the kitchen lights.",
          data: { entityId: "light.kitchen" },
        });
      },
    });

    const result = await host.invoke("fake-light-skill", {
      action: "turn-off",
      input: { entityId: "light.kitchen" },
    });

    expect(result).toEqual({
      status: "succeeded",
      responseText: "Turned off the kitchen lights.",
      data: { entityId: "light.kitchen" },
    });
    expect(requests).toEqual([
      {
        entrypointPath: path.join(
          installedSkillsDirForDataDir(dataDir),
          "fake-light-skill",
          "adapter.js",
        ),
        manifestId: "fake-light-skill",
      },
    ]);
  });

  it("loads a real in-process Skill adapter from the manifest entrypoint", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "fake-light-skill", {
      manifest: validManifest({
        id: "fake-light-skill",
        entrypoint: "./adapter.mjs",
      }),
      entrypointContents: [
        "export default {",
        "  invoke: ({ action, input }) => ({",
        "    status: 'succeeded',",
        "    responseText: 'Handled ' + action + '.',",
        "    data: input,",
        "  }),",
        "};",
      ].join("\n"),
      entrypointName: "adapter.mjs",
    });

    const result = await new SkillHost({ dataDir }).invoke("fake-light-skill", {
      action: "turn-off",
      input: { entityId: "light.kitchen" },
    });

    expect(result).toEqual({
      status: "succeeded",
      responseText: "Handled turn-off.",
      data: { entityId: "light.kitchen" },
    });
  });

  it("loads Brain-owned Skill Configuration when an invocation does not provide configuration", async () => {
    const dataDir = await createDataDir();
    await writeSkillPackage(dataDir, "fake-light-skill", {
      manifest: validManifest({
        id: "fake-light-skill",
      }),
      entrypointContents: "export default {};",
    });
    await mkdir(path.dirname(skillConfigurationPath(dataDir, "fake-light-skill")), {
      recursive: true,
    });
    await writeFile(
      skillConfigurationPath(dataDir, "fake-light-skill"),
      JSON.stringify({ baseUrl: "http://homeassistant.local:8123", accessToken: "secret" }),
    );
    const requests: unknown[] = [];

    const result = await new SkillHost({
      dataDir,
      loadAdapter: async () => ({
        invoke: (request) => {
          requests.push(request);
          return {
            status: "succeeded",
            responseText: "Configured.",
          };
        },
      }),
    }).invoke("fake-light-skill", {
      action: "discover-entities",
      input: {},
    });

    expect(result).toMatchObject({ status: "succeeded" });
    expect(requests).toEqual([
      {
        action: "discover-entities",
        input: {},
        configuration: {
          baseUrl: "http://homeassistant.local:8123",
          accessToken: "secret",
        },
      },
    ]);
  });

  it("rejects invocation for Skills that are not installed", async () => {
    const dataDir = await createDataDir();

    await expect(
      new SkillHost({ dataDir }).invoke("missing-skill", {
        action: "noop",
        input: {},
      }),
    ).rejects.toBeInstanceOf(SkillHostError);
  });
});

async function createDataDir() {
  return mkdtemp(path.join(tmpdir(), "open-nexus-skill-host-"));
}

async function writeSkillPackage(
  dataDir: string,
  packageName: string,
  options: {
    manifest: unknown;
    entrypointContents?: string;
    entrypointName?: string;
  },
) {
  const packagePath = path.join(installedSkillsDirForDataDir(dataDir), packageName);
  await mkdir(packagePath, { recursive: true });
  await writeFile(path.join(packagePath, "skill.json"), JSON.stringify(options.manifest));

  if (options.entrypointContents) {
    await writeFile(
      path.join(packagePath, options.entrypointName ?? "adapter.js"),
      options.entrypointContents,
    );
  }
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

function fakeAdapter(
  result: Awaited<ReturnType<SkillAdapter["invoke"]>> = {
    status: "succeeded",
    responseText: "Done.",
  },
): SkillAdapter {
  return {
    invoke: () => result,
  };
}
