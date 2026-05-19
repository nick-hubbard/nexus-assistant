# Open Nexus

Open Nexus is a local-first assistant system made of a Brain Server and one or more touchscreen Device UIs.

## Requirements

- Node.js 18 or newer
- pnpm 9

## Local Setup

Install workspace dependencies from the repo root:

```sh
pnpm install
```

The default local development configuration uses the fake AI Provider, so subscription runtime setup is not required for `pnpm dev`.

To customize local settings, copy the example environment files:

```sh
cp apps/brain/.env.example apps/brain/.env
cp apps/device-ui/.env.example apps/device-ui/.env
```

## Local Development

Start the Brain Server and Device UI together:

```sh
pnpm dev
```

Expected local URLs:

- Brain Server HTTP API: `http://127.0.0.1:4317`
- Brain Server WebSocket events: `ws://127.0.0.1:4317/events`
- Device UI: `http://localhost:3000`

The Brain Server defaults to `BRAIN_AI_PROVIDER=fake` and stores local Brain Files and Interaction Logs under `apps/brain/data/brain` when started from the workspace script.

To ask the Device UI questions through a logged-in Codex subscription, authenticate the Codex CLI on the same machine that runs the Brain Server:

```sh
codex login
```

Then set the Brain Server provider:

```sh
BRAIN_AI_PROVIDER=openai-codex
```

The `openai-codex` Subscription Provider uses the local Codex CLI as a runtime bridge. By default it runs `codex exec "<prompt>"`; override `BRAIN_CODEX_COMMAND`, `BRAIN_CODEX_ARGS`, or `BRAIN_CODEX_TIMEOUT_MS` if your Codex install needs a different command, profile, or timeout.

If your global `codex` wrapper is unavailable but `npx @openai/codex@latest exec` works, use:

```sh
BRAIN_CODEX_COMMAND=npx
BRAIN_CODEX_ARGS=-y @openai/codex@latest exec
```

## Raspberry Pi Kiosk Deployment

Repo-owned Kiosk Deployment assets live in `deploy/device-ui/raspberry-pi/`.

Use them to install a systemd service that launches the Device UI fullscreen in Chromium when the Raspberry Pi boots. See `deploy/device-ui/raspberry-pi/README.md` for install, update, start, stop, and troubleshooting steps.

## Brain Server Docker Deployment

Repo-owned Brain Server Docker assets live in `deploy/brain/`.

Use them to build and run a local container with the Brain Server port published and `/data` mounted for persistent Brain Files and SQLite Interaction Logs. See `deploy/brain/README.md` for build, compose, environment, and Subscription Provider bridge notes.

## Environment

Brain Server settings live in `apps/brain/.env`:

- `BRAIN_PORT`: HTTP and WebSocket port. Defaults to `4317`.
- `BRAIN_HOST`: Host interface. Defaults to `127.0.0.1`.
- `BRAIN_VERSION`: Version returned by `/health`. Defaults to `0.1.0`.
- `BRAIN_AI_PROVIDER`: AI Provider mode. Use `fake` for local development or `openai-codex` for the Codex CLI bridge.
- `BRAIN_DATA_DIR`: Directory for Brain Files and Interaction Logs.
- `BRAIN_CODEX_COMMAND`: Command used by the `openai-codex` bridge. Defaults to `codex`.
- `BRAIN_CODEX_ARGS`: Whitespace-separated arguments before the prompt. Defaults to `exec`.
- `BRAIN_CODEX_TIMEOUT_MS`: Bridge timeout in milliseconds. Defaults to `120000`.
- `DISCORD_WEBHOOK_URL`: Optional Issue Reporter destination for System Issues.

Device UI settings live in `apps/device-ui/.env`:

- `NEXT_PUBLIC_BRAIN_HTTP_URL`: Browser-visible Brain Server HTTP base URL.
- `NEXT_PUBLIC_BRAIN_WS_URL`: Browser-visible Brain Server WebSocket base URL.
- `NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL`: Browser-visible local Device Runtime WebSocket base URL.
- `NEXT_PUBLIC_DEVICE_UI_MODE`: Set to `development` to enable the Option+T Development Wake Shortcut; plain `pnpm dev` also enables it through Next.js development mode.

## Merge Gate

Run the local validation suite before opening or merging a PR:

```sh
pnpm validate
```

This runs linting, type validation, tests, and builds across the workspace.

Pull requests into `main` and `develop` are protected by the GitHub Merge Gate policy. See [docs/github-protected-branches.md](docs/github-protected-branches.md) for the required branch protection settings and the `gh` setup script.
