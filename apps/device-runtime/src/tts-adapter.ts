import { type ChildProcess, spawn } from "node:child_process";
import type { SpeakPromptExchangeResponseCommand } from "@open-nexus/protocol";

export interface SpokenResponsePlayback {
  cancel: () => void;
  finished: Promise<void>;
}

export interface SpokenResponseTtsAdapter {
  speak: (command: SpeakPromptExchangeResponseCommand) => SpokenResponsePlayback;
}

export function createLocalSayTtsAdapter(
  command = process.env.DEVICE_RUNTIME_TTS_COMMAND ?? "say",
) {
  return {
    speak(spokenResponse: SpeakPromptExchangeResponseCommand) {
      const child = spawn(command, [spokenResponse.responseText], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      return createChildProcessPlayback(child);
    },
  } satisfies SpokenResponseTtsAdapter;
}

function createChildProcessPlayback(child: ChildProcess): SpokenResponsePlayback {
  let cancelled = false;

  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (cancelled || code === 0 || signal === "SIGTERM") {
        resolve();
        return;
      }
      reject(new Error(`Spoken Response playback exited with code ${code ?? "unknown"}.`));
    });
  });

  return {
    cancel() {
      cancelled = true;
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    },
    finished,
  };
}

export function createFakeTtsAdapter() {
  const spokenResponses: SpeakPromptExchangeResponseCommand[] = [];
  const cancellations: SpeakPromptExchangeResponseCommand[] = [];

  const adapter: SpokenResponseTtsAdapter = {
    speak(spokenResponse) {
      spokenResponses.push(spokenResponse);
      let cancelled = false;
      let resolveFinished: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });

      return {
        cancel() {
          if (cancelled) {
            return;
          }
          cancelled = true;
          cancellations.push(spokenResponse);
          resolveFinished();
        },
        finished,
      };
    },
  };

  return { adapter, spokenResponses, cancellations };
}
