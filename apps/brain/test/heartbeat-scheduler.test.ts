import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initializeBrainFiles } from "../src/brain-files.js";
import { HeartbeatScheduler, isTaskDue, readHeartbeatTasks } from "../src/heartbeat-scheduler.js";
import { InteractionLog } from "../src/interaction-log.js";
import { installedSkillsDirForDataDir, type SkillAdapter, SkillHost } from "../src/skill-host.js";

describe("Heartbeat Scheduler", () => {
  it("initializes a human-editable HEARTBEAT.md Brain File", async () => {
    const dataDir = await createDataDir();

    await initializeBrainFiles(dataDir);

    await expect(readFile(path.join(dataDir, "HEARTBEAT.md"), "utf8")).resolves.toContain(
      "```nexus-heartbeat",
    );
  });

  it("loads scheduled Skill actions from HEARTBEAT.md", async () => {
    const dataDir = await createDataDir();
    await writeHeartbeatFile(dataDir, [
      {
        id: "morning-weather",
        name: "Morning weather",
        schedule: { every: "1m" },
        skillId: "weather",
        action: "daily-brief",
        input: { location: "Indianapolis, IN" },
      },
    ]);
    await writeWeatherSkillPackage(dataDir);

    await expect(readHeartbeatTasks(dataDir)).resolves.toMatchObject([
      {
        id: "morning-weather",
        skillId: "weather",
        action: "daily-brief",
        input: { location: "Indianapolis, IN" },
        enabled: true,
      },
    ]);
  });

  it("understands interval and five-field cron due checks", () => {
    expect(
      isTaskDue(
        {
          id: "interval-check",
          name: "Interval check",
          schedule: { every: "30m" },
          skillId: "weather",
          action: "read",
          enabled: true,
        },
        new Date(2026, 4, 20, 12, 30),
        new Date(2026, 4, 20, 12, 0),
      ),
    ).toBe(true);

    expect(
      isTaskDue(
        {
          id: "daily-check",
          name: "Daily check",
          schedule: { cron: "30 12 * * *" },
          skillId: "weather",
          action: "read",
          enabled: true,
        },
        new Date(2026, 4, 20, 12, 30),
        undefined,
      ),
    ).toBe(true);
  });

  it("invokes due Skill actions and records heartbeat state", async () => {
    const dataDir = await createDataDir();
    const interactionLog = new InteractionLog(dataDir);
    const skillRequests: unknown[] = [];
    await writeHeartbeatFile(dataDir, [
      {
        id: "morning-weather",
        name: "Morning weather",
        schedule: { every: "1m" },
        skillId: "weather",
        action: "daily-brief",
        input: { location: "Indianapolis, IN" },
      },
    ]);
    await writeWeatherSkillPackage(dataDir);

    const scheduler = new HeartbeatScheduler({
      dataDir,
      interactionLog,
      skillHost: new SkillHost({
        dataDir,
        loadAdapter: async () => fakeWeatherAdapter(skillRequests),
      }),
      now: () => new Date(2026, 4, 20, 7, 0),
    });

    const runs = await scheduler.runDueTasks();

    expect(runs).toEqual([
      {
        taskId: "morning-weather",
        status: "succeeded",
        responseText: "It is 72 degrees and clear in Indianapolis.",
      },
    ]);
    expect(skillRequests).toEqual([
      {
        action: "daily-brief",
        input: { location: "Indianapolis, IN" },
        configuration: undefined,
      },
    ]);
    expect(interactionLog.allEvents().map((event) => event.type)).toEqual(["skill.invocation"]);
    await expect(readFile(path.join(dataDir, "heartbeat-state.json"), "utf8")).resolves.toContain(
      "morning-weather",
    );

    interactionLog.close();
  });
});

async function createDataDir() {
  return mkdtemp(path.join(tmpdir(), "open-nexus-heartbeat-"));
}

async function writeHeartbeatFile(dataDir: string, tasks: unknown[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "HEARTBEAT.md"),
    ["# Heartbeat", "", "```nexus-heartbeat", JSON.stringify(tasks, null, 2), "```", ""].join("\n"),
  );
}

function fakeWeatherAdapter(requests: unknown[]): SkillAdapter {
  return {
    invoke: (request) => {
      requests.push(request);
      return {
        status: "succeeded",
        responseText: "It is 72 degrees and clear in Indianapolis.",
      };
    },
  };
}

async function writeWeatherSkillPackage(dataDir: string) {
  const packagePath = path.join(installedSkillsDirForDataDir(dataDir), "weather");
  await mkdir(packagePath, { recursive: true });
  await writeFile(path.join(packagePath, "adapter.js"), "export default {};\n");
  await writeFile(
    path.join(packagePath, "skill.json"),
    JSON.stringify({
      id: "weather",
      name: "Weather",
      version: "0.1.0",
      entrypoint: "./adapter.js",
      capabilities: [
        {
          id: "weather.daily-brief",
          title: "Daily Weather Brief",
          description: "Reads a weather forecast for a configured location.",
          actions: ["daily-brief"],
          examples: ["Tell me the weather every morning."],
        },
      ],
      configurationSchema: {
        type: "object",
        properties: {},
      },
    }),
  );
}
