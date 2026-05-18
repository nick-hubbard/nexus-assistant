# Brain Server Docker Deployment

These assets run the Brain Server as a user-controlled Local Deployment service. The container stores Brain Files and SQLite Interaction Logs in `/data`, so bind-mount or name that volume before using it for real assistant state.

## Files

- `Dockerfile`: Builds a Brain Server image from the workspace.
- `compose.yml`: Example local compose service with port and `/data` mappings.
- `data/`: Optional local bind-mount directory created by compose when the service starts.

## Build

From the repo root:

```sh
docker build -f deploy/brain/Dockerfile -t open-nexus/brain:local .
```

Or with compose:

```sh
docker compose -f deploy/brain/compose.yml build
```

## Run

```sh
docker compose -f deploy/brain/compose.yml up
```

The compose example maps:

- Brain Server HTTP API: `http://127.0.0.1:4317`
- Brain Server WebSocket events: `ws://127.0.0.1:4317/events`
- Host data directory: `deploy/brain/data`
- Container data directory: `/data`

The Brain Server initializes `/data/IDENTITY.md`, `/data/MEMORY.md`, and `/data/INSTRUCTIONS.md` without overwriting existing edits. SQLite Interaction Logs are stored at `/data/interaction-logs.sqlite`. Keeping the host volume mounted preserves both Brain Files and Interaction Logs across container restarts and image updates.

## Environment

Required for Docker:

- `BRAIN_HOST=0.0.0.0`: Allows the Brain Server to accept traffic through Docker port publishing.
- `BRAIN_PORT=4317`: HTTP and WebSocket port exposed by the container.
- `BRAIN_DATA_DIR=/data`: Persistent Brain Files and Interaction Logs volume.

Common optional settings:

- `BRAIN_VERSION=0.1.0`: Version returned by `/health`.
- `BRAIN_AI_PROVIDER=fake`: Current Docker-safe AI Provider mode.
- `DISCORD_WEBHOOK_URL`: Optional Issue Reporter destination for System Issues.

## Subscription Provider Bridge Limitations

The Docker image defaults to the fake AI Provider because the OpenAI/Codex Subscription Provider is designed around a local authenticated runtime bridge, not an OpenAI Platform API key. Do not bake subscription credentials, browser profiles, or local runtime sockets into the image.

Until the `openai-codex` Subscription Provider adapter is implemented, run Docker deployments with `BRAIN_AI_PROVIDER=fake`. When the bridge exists, prefer mounting only the narrow runtime bridge files or sockets needed by that adapter, and keep user subscription authentication owned by the host machine.

## Validation

Build validation for these assets is:

```sh
docker build -f deploy/brain/Dockerfile -t open-nexus/brain:local .
docker compose -f deploy/brain/compose.yml config
```

After starting compose, verify the service:

```sh
curl http://127.0.0.1:4317/health
ls deploy/brain/data
```
