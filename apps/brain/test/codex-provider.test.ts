import { describe, expect, it } from "vitest";
import {
  buildCodexCommand,
  CodexCliProvider,
  type CodexCommand,
  type CodexCommandResult,
  normalizeCodexOutput,
} from "../src/codex-provider.js";
import { AiProviderError } from "../src/provider.js";

describe("Codex CLI Provider", () => {
  it("builds the bridge command with the prompt as the final argument", () => {
    expect(
      buildCodexCommand({
        command: "codex",
        args: ["exec", "--profile", "open-nexus"],
        prompt: "What is next?",
      }),
    ).toEqual({
      command: "codex",
      args: ["exec", "--profile", "open-nexus", "What is next?"],
    });
  });

  it("normalizes stdout into the assistant response", () => {
    expect(normalizeCodexOutput("\n  Here is the answer.  \n")).toBe("Here is the answer.");
  });

  it("rejects empty bridge output", () => {
    expect(() => normalizeCodexOutput("\n\n")).toThrow(AiProviderError);
  });

  it("returns normalized output from the configured runner", async () => {
    const commands: CodexCommand[] = [];
    const provider = new CodexCliProvider({
      command: "codex",
      args: ["exec"],
      timeoutMs: 5000,
      runner: async (command) => {
        commands.push(command);
        return result({ stdout: " Codex response.\n" });
      },
    });

    const chunks = [];
    for await (const chunk of provider.complete({ prompt: "Hello" })) {
      chunks.push(chunk);
    }

    expect(commands).toEqual([{ command: "codex", args: ["exec", "Hello"] }]);
    expect(chunks).toEqual([{ delta: "Codex response." }]);
  });

  it("surfaces timeout diagnostics", async () => {
    const provider = new CodexCliProvider({
      command: "codex",
      args: ["exec"],
      timeoutMs: 10,
      runner: async () =>
        result({
          stderr: "still thinking",
          timedOut: true,
        }),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      providerName: "openai-codex",
      message: "Codex bridge timed out.",
      diagnostics: {
        command: "codex",
        args: ["exec"],
        timeoutMs: 10,
        stderr: "still thinking",
      },
    });
  });

  it("surfaces unsuccessful bridge exits", async () => {
    const provider = new CodexCliProvider({
      command: "codex",
      args: ["exec"],
      timeoutMs: 5000,
      runner: async () =>
        result({
          exitCode: 1,
          stderr: "not logged in",
        }),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      providerName: "openai-codex",
      message: "Codex bridge exited unsuccessfully.",
      diagnostics: {
        exitCode: 1,
        stderr: "not logged in",
      },
    });
  });
});

function result(overrides: Partial<CodexCommandResult>): CodexCommandResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    ...overrides,
  };
}

async function collect(provider: CodexCliProvider) {
  const chunks = [];

  for await (const chunk of provider.complete({ prompt: "Hello" })) {
    chunks.push(chunk);
  }

  return chunks;
}
