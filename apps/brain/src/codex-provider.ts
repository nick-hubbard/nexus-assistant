import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { type AiProvider, AiProviderError, type ProviderPrompt } from "./provider.js";

export interface CodexCliProviderOptions {
  command: string;
  args: string[];
  timeoutMs: number;
  cwd?: string;
  runner?: CodexCommandRunner;
}

export interface CodexCommand {
  command: string;
  args: string[];
}

export interface CodexCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CodexCommandRunner = (
  command: CodexCommand,
  options: { timeoutMs: number; cwd?: string },
) => Promise<CodexCommandResult>;

const providerName = "openai-codex";

export function buildCodexCommand(options: { command: string; args: string[]; prompt: string }) {
  return {
    command: options.command,
    args: [...options.args, options.prompt],
  };
}

export function normalizeCodexOutput(stdout: string) {
  const text = stdout.trim();

  if (!text) {
    throw new AiProviderError(providerName, "Codex bridge returned an empty response.", {
      stdoutLength: stdout.length,
    });
  }

  return text;
}

export class CodexCliProvider implements AiProvider {
  readonly name = providerName;
  private readonly options: CodexCliProviderOptions;

  constructor(options: CodexCliProviderOptions) {
    this.options = options;
  }

  async *complete({ prompt }: ProviderPrompt) {
    const command = buildCodexCommand({
      command: this.options.command,
      args: this.options.args,
      prompt,
    });
    const runnerOptions = {
      timeoutMs: this.options.timeoutMs,
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
    };
    if (!this.options.runner) {
      yield* streamCodexCommand(command, runnerOptions);
      return;
    }

    const result = await this.options.runner(command, runnerOptions);

    if (result.timedOut) {
      throw new AiProviderError(providerName, "Codex bridge timed out.", {
        command: command.command,
        args: command.args.slice(0, -1),
        timeoutMs: this.options.timeoutMs,
        stderr: result.stderr.trim(),
      });
    }

    if (result.exitCode !== 0) {
      throw new AiProviderError(providerName, "Codex bridge exited unsuccessfully.", {
        command: command.command,
        args: command.args.slice(0, -1),
        exitCode: result.exitCode,
        signal: result.signal,
        stderr: result.stderr.trim(),
      });
    }

    yield { delta: normalizeCodexOutput(result.stdout) };
  }
}

export function runCodexCommand(
  command: CodexCommand,
  options: { timeoutMs: number; cwd?: string },
): Promise<CodexCommandResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const child: ChildProcessWithoutNullStreams = spawn(command.command, command.args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
    });
    child.stdin.end();

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(
        new AiProviderError(providerName, "Codex bridge could not be started.", {
          command: command.command,
          args: command.args.slice(0, -1),
          cause: error.message,
        }),
      );
    });
    child.once("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

export async function* streamCodexCommand(
  command: CodexCommand,
  options: { timeoutMs: number; cwd?: string },
) {
  const output = runStreamingCodexCommand(command, options);
  let stdout = "";

  try {
    for await (const chunk of output.stdoutChunks) {
      stdout += chunk;
      yield { delta: chunk };
    }

    const result = await output.result;

    if (result.timedOut) {
      throw new AiProviderError(providerName, "Codex bridge timed out.", {
        command: command.command,
        args: command.args.slice(0, -1),
        timeoutMs: options.timeoutMs,
        stderr: result.stderr.trim(),
      });
    }

    if (result.exitCode !== 0) {
      throw new AiProviderError(providerName, "Codex bridge exited unsuccessfully.", {
        command: command.command,
        args: command.args.slice(0, -1),
        exitCode: result.exitCode,
        signal: result.signal,
        stderr: result.stderr.trim(),
      });
    }

    normalizeCodexOutput(stdout);
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }

    throw new AiProviderError(providerName, "Codex bridge could not be started.", {
      command: command.command,
      args: command.args.slice(0, -1),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function runStreamingCodexCommand(
  command: CodexCommand,
  options: { timeoutMs: number; cwd?: string },
): {
  stdoutChunks: AsyncGenerator<string>;
  result: Promise<CodexCommandResult>;
} {
  const stdoutChunks: string[] = [];
  const waitingReaders: Array<() => void> = [];
  let closed = false;
  let startupError: Error | undefined;
  let timedOut = false;
  let stdout = "";
  let stderr = "";

  const child: ChildProcessWithoutNullStreams = spawn(command.command, command.args, {
    cwd: options.cwd,
    env: process.env,
    shell: false,
  });
  child.stdin.end();

  const wakeReaders = () => {
    for (const wakeReader of waitingReaders.splice(0)) {
      wakeReader();
    }
  };

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    stdoutChunks.push(chunk);
    wakeReaders();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.once("error", (error) => {
    startupError = error;
    closed = true;
    clearTimeout(timeout);
    wakeReaders();
  });

  const result = new Promise<CodexCommandResult>((resolve) => {
    child.once("close", (exitCode, signal) => {
      closed = true;
      clearTimeout(timeout);
      wakeReaders();

      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });
  });

  async function* readStdoutChunks() {
    while (!closed || stdoutChunks.length > 0) {
      const chunk = stdoutChunks.shift();
      if (chunk !== undefined) {
        yield chunk;
        continue;
      }

      await new Promise<void>((resolve) => waitingReaders.push(resolve));
    }

    if (startupError) {
      throw startupError;
    }
  }

  return {
    stdoutChunks: readStdoutChunks(),
    result,
  };
}
