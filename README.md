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

## Environment

Brain Server settings live in `apps/brain/.env`:

- `BRAIN_PORT`: HTTP and WebSocket port. Defaults to `4317`.
- `BRAIN_HOST`: Host interface. Defaults to `127.0.0.1`.
- `BRAIN_VERSION`: Version returned by `/health`. Defaults to `0.1.0`.
- `BRAIN_AI_PROVIDER`: AI Provider mode. Use `fake` for local development.
- `BRAIN_DATA_DIR`: Directory for Brain Files and Interaction Logs.
- `DISCORD_WEBHOOK_URL`: Optional Issue Reporter destination for System Issues.

Device UI settings live in `apps/device-ui/.env`:

- `NEXT_PUBLIC_BRAIN_HTTP_URL`: Browser-visible Brain Server HTTP base URL.
- `NEXT_PUBLIC_BRAIN_WS_URL`: Browser-visible Brain Server WebSocket base URL.

## Merge Gate

Run the local validation suite before opening or merging a PR:

```sh
pnpm validate
```

This runs linting, type validation, tests, and builds across the workspace.
