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
- `BRAIN_AI_PROVIDER=fake`: Docker-safe AI Provider mode. Use `openai-api` for direct OpenAI Platform API calls, or `openai-codex` only when the container can invoke a host-authenticated Codex bridge.
- `BRAIN_CODEX_COMMAND=codex`: Command used by the `openai-codex` bridge.
- `BRAIN_CODEX_ARGS=exec`: Whitespace-separated arguments passed before the prompt.
- `BRAIN_CODEX_TIMEOUT_MS=120000`: Bridge timeout in milliseconds.
- `BRAIN_OPENAI_API_KEY`: OpenAI Platform API key used when `BRAIN_AI_PROVIDER=openai-api`. Falls back to `OPENAI_API_KEY`.
- `BRAIN_OPENAI_MODEL=gpt-5.5`: Responses API model used by the `openai-api` Provider.
- `BRAIN_OPENAI_TIMEOUT_MS=30000`: Direct API request timeout in milliseconds.
- `BRAIN_OPENAI_REASONING_EFFORT=low`: Reasoning effort for the `openai-api` Provider.
- `BRAIN_OPENAI_VERBOSITY=low`: Text verbosity for the `openai-api` Provider.
- `DISCORD_WEBHOOK_URL`: Optional Issue Reporter destination for System Issues.

## AI Provider Options

For direct OpenAI Platform API testing, set `BRAIN_AI_PROVIDER=openai-api` and provide `BRAIN_OPENAI_API_KEY` or `OPENAI_API_KEY`. The adapter calls the OpenAI Responses API directly and streams response text deltas through the existing Prompt Exchange event flow.

## Subscription Provider Bridge Limitations

The Docker image defaults to the fake AI Provider because the OpenAI/Codex Subscription Provider is designed around a local authenticated runtime bridge, not an OpenAI Platform API key. Do not bake subscription credentials, browser profiles, or local runtime sockets into the image.

For host-local development, run `codex login` on the same machine that starts the Brain Server, set `BRAIN_AI_PROVIDER=openai-codex`, and start the Brain Server normally. The adapter invokes `codex exec "<prompt>"` by default and turns non-zero exits, startup failures, empty output, and timeouts into provider System Issues.

If the installed global `codex` wrapper is unavailable but `npx @openai/codex@latest exec` works, set `BRAIN_CODEX_COMMAND=npx` and `BRAIN_CODEX_ARGS="-y @openai/codex@latest exec"`.

For Docker deployments, keep `BRAIN_AI_PROVIDER=fake` unless you intentionally expose a narrow host-authenticated Codex bridge command into the container. Keep user subscription authentication owned by the host machine.

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
