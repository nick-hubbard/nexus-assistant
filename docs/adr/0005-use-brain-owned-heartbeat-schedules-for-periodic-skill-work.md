# Use Brain-Owned Heartbeat Schedules for Periodic Skill Work

Open Nexus needs local scheduled work, such as a morning weather brief, without turning each integration into its own long-running daemon. We will model this as a Brain-owned **Heartbeat Scheduler** that reads a Markdown **Brain File** named `HEARTBEAT.md`, determines which scheduled items are due, and invokes installed **Skills** through the existing **Skill Host**. This keeps scheduling transparent and local-first while preserving the same Skill installation, configuration, and invocation boundary used by prompt-driven assistant capabilities.

The first implementation supports explicit scheduled Skill actions in a `nexus-heartbeat` JSON code block inside `HEARTBEAT.md`. Schedules can use simple intervals such as `30m` and five-field cron-like expressions such as `0 7 * * *`. Later slices can add a friendlier CLI, richer schedule grammar, delivery routing to devices, and natural-language editing while keeping the on-disk file inspectable.

**Considered Options**

- Use the host operating system crontab, which is familiar but hides Nexus intent outside Brain-owned data and bypasses Skill Host logging and policy boundaries.
- Let each Skill own scheduling, which makes integrations flexible but duplicates timers, retry behavior, state, and audit records across Skill packages.
- Reuse the prompt **Assistant Orchestrator** for all scheduled work, which is useful for open-ended agent turns but unnecessary for deterministic Skill actions such as a weather brief.
- Start with a Brain-owned scheduler and explicit Skill action records in `HEARTBEAT.md`, which gives Nexus a local cron-like foundation while keeping future agentic heartbeat behavior possible.
