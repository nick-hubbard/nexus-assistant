import { mkdir, open } from "node:fs/promises";
import path from "node:path";

export const brainFileNames = [
  "IDENTITY.md",
  "MEMORY.md",
  "INSTRUCTIONS.md",
  "HEARTBEAT.md",
] as const;

const defaultBrainFileContents: Record<(typeof brainFileNames)[number], string> = {
  "IDENTITY.md": "# Identity\n\nOpen Nexus local assistant.\n",
  "MEMORY.md": "# Memory\n\n",
  "INSTRUCTIONS.md": "# Instructions\n\n",
  "HEARTBEAT.md": [
    "# Heartbeat",
    "",
    "Add scheduled Nexus work in a `nexus-heartbeat` JSON code block.",
    "",
    "```nexus-heartbeat",
    "[]",
    "```",
    "",
  ].join("\n"),
};

export async function initializeBrainFiles(dataDir: string) {
  await mkdir(dataDir, { recursive: true });

  await Promise.all(
    brainFileNames.map(async (fileName) => {
      const filePath = path.join(dataDir, fileName);
      const handle = await open(filePath, "a+");

      try {
        const stats = await handle.stat();
        if (stats.size === 0) {
          await handle.writeFile(defaultBrainFileContents[fileName]);
        }
      } finally {
        await handle.close();
      }
    }),
  );
}
