import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { localDevWorkspaceTargets, mergeGateChecks } from "../src/index.js";

describe("mergeGateChecks", () => {
  it("captures the required local validation steps", () => {
    expect(mergeGateChecks()).toEqual(["lint", "check-types", "test", "build"]);
  });

  it("captures the local development apps started by pnpm dev", () => {
    const targets = localDevWorkspaceTargets();
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const rootPackageJson = JSON.parse(
      readFileSync(resolve(testDir, "../../../package.json"), "utf8"),
    ) as { scripts: { dev: string } };

    expect(targets).toEqual([
      "@open-nexus/brain",
      "@open-nexus/device-ui",
      "@open-nexus/device-runtime",
    ]);
    expect(rootPackageJson.scripts.dev).toBe(
      `turbo run dev ${targets.map((target) => `--filter=${target}`).join(" ")}`,
    );
  });
});
