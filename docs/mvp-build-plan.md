# Open Nexus MVP Build Plan

This plan builds the initial Open Nexus assistant as a local-first monorepo with a Brain Server, a Raspberry Pi-friendly Device UI, shared protocol contracts, ShadCN-based UI components, strict Biome validation, full-suite merge gates, and Discord reporting for system issues.

## Target Monorepo Shape

```txt
apps/
  brain/
  device-ui/

packages/
  ai/
  notifications/
  protocol/
  skills/
  ui/

deploy/
  brain/
  device-ui/
    raspberry-pi/

docs/
  adr/
```

## Phase 1: Workspace Foundation

1. Replace the starter Turborepo assumptions with Open Nexus project scripts.
2. Add Biome as the single lint/format validation tool.
3. Add TypeScript config packages or root shared configs for strict app/package builds.
4. Add a test runner and root `pnpm test` that runs the full suite through Turbo.
5. Add local git hooks that block commits on `main` and `develop`.
6. Add documentation or a setup script for GitHub branch protection/rulesets.

Expected root commands:

```sh
pnpm dev
pnpm build
pnpm lint
pnpm check-types
pnpm test
pnpm validate
```

## Phase 2: Shared Contracts

1. Create `packages/protocol` with Zod schemas and TypeScript types for:
   - health responses
   - prompt requests
   - prompt exchange IDs
   - WebSocket events
   - device status
   - system issues
2. Ensure both `apps/brain` and `apps/device-ui` import contracts from `packages/protocol`.
3. Add unit tests for protocol parsing and invalid payload rejection.

Initial Brain Server API:

```txt
GET /health
POST /prompts
POST /system-issues
WS /events
```

## Phase 3: Brain Server

1. Create `apps/brain` as an ExpressJS TypeScript service.
2. Add config validation for:
   - host/port
   - data directory
   - subscription provider command/runtime settings
   - Discord webhook URL
3. Add WebSocket support for live Brain-to-Device events.
4. Add SQLite-backed Interaction Logs under the configured data directory.
5. Add Markdown Brain Files under the configured data directory:
   - `IDENTITY.md`
   - `MEMORY.md`
   - `INSTRUCTIONS.md`
6. Add a fake provider adapter for tests and local UI development.
7. Add an `openai-codex` Subscription Provider adapter behind a local runtime bridge.

The Brain Server owns provider calls, Issue Reporters, Interaction Logs, and Brain Files.

## Phase 4: Notifications

1. Create `packages/notifications` for Issue Reporter types and helpers.
2. Add `DiscordIssueReporter` as the first reporter implementation.
3. Send only System Issues to Discord:
   - setup failures
   - misconfiguration
   - provider/runtime bridge failures
   - connection failures
   - fatal/unhandled runtime errors
4. Do not send normal prompts, normal responses, or poor answer quality to Discord.
5. Include correlation IDs so Discord messages can be matched to SQLite Interaction Logs.

## Phase 5: UI Package

1. Create `packages/ui` with Tailwind and ShadCN-compatible primitives.
2. Use this structure:

```txt
packages/ui/src/primitives/
packages/ui/src/device-ui/
```

3. Add low-level components first:
   - button
   - input
   - textarea
   - dialog
   - card or panel only where actually useful
   - status badge
   - navigation primitives
4. Add Device UI components:
   - connection status
   - idle clock
   - background/slideshow frame
   - prompt composer
   - assistant response view
   - system issue banner

Next.js route composition stays inside `apps/device-ui`; reusable rendered components live in `packages/ui`.

## Phase 6: Device UI

1. Create `apps/device-ui` as a Next.js app.
2. Configure it for fullscreen touchscreen use.
3. Add runtime config for `BRAIN_SERVER_URL`.
4. Implement the first screen:
   - background image/slideshow
   - current time
   - connection status
   - prompt input
   - assistant response output
5. Connect HTTP prompt submission to `POST /prompts`.
6. Connect WebSocket events to live status and response updates.
7. Report Device UI System Issues to `POST /system-issues`; never call Discord directly.

## Phase 7: Local Dev Experience

1. Ensure `pnpm dev` starts both:
   - `apps/brain`
   - `apps/device-ui`
2. Use a fake provider by default when subscription runtime auth is not configured.
3. Provide `.env.example` files for both apps.
4. Document local setup in the root README.

## Phase 8: Deployment Assets

1. Add Raspberry Pi kiosk deployment files under `deploy/device-ui/raspberry-pi/`:
   - systemd service
   - install script
   - Chromium kiosk launch command
   - environment example
   - setup README
2. Add Brain Docker assets under `deploy/brain/`:
   - Dockerfile or Dockerfile template
   - compose example
   - `/data` volume convention
3. Keep Docker support compatible with Brain Files and SQLite Interaction Logs.

## Phase 9: CI and Protection

1. Add GitHub Actions for the Merge Gate:
   - install dependencies
   - run Biome lint/check
   - run TypeScript validation
   - run the full test suite
   - run builds
2. Configure branch protection/rulesets for `main` and `develop`:
   - require PRs
   - block direct pushes
   - require Merge Gate checks
3. Keep real OpenAI/Codex subscription calls and real Discord webhooks out of CI unless a later explicit CI environment is designed for them.

## Suggested Implementation Order

1. Foundation: Biome, scripts, test runner, workspace cleanup.
2. Protocol package.
3. Brain skeleton with health, prompt, WebSocket, fake provider.
4. Device UI skeleton using shared UI package.
5. SQLite Interaction Logs and Brain Files.
6. Discord Issue Reporter.
7. `openai-codex` local runtime bridge spike.
8. Raspberry Pi kiosk assets.
9. Brain Docker assets.
10. GitHub Actions and branch protection docs.

## Open Questions For Implementation

- Which local runtime bridge will power `openai-codex` first: Codex CLI directly, OpenClaw-compatible command execution, or another command interface?
- What exact WebSocket event names should be used for streaming assistant output?
- Should Brain Files be edited only on disk in v1, or should the Device UI eventually expose an admin/settings view?
- Should Interaction Logs retain full prompt/response text by default, or should privacy controls redact/summarize them?
