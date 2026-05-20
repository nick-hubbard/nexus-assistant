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
- Device Runtime health: `http://127.0.0.1:4318/health`

The Brain Server defaults to `BRAIN_AI_PROVIDER=fake` and stores local Brain Files and Interaction Logs under `apps/brain/data/brain` when started from the workspace script.

The workspace dev script also starts the local Device Runtime. The Device Runtime is the device-side companion service for hardware-facing capabilities such as wake phrase events, speech transcription events, and production Spoken Response playback. To run it by itself for local development or physical-device use:

```sh
pnpm --filter @open-nexus/device-runtime dev
```

By default it listens on `127.0.0.1:4318`, exposes `/health`, and accepts WebSocket command traffic at `ws://127.0.0.1:4318/commands`. Set `DEVICE_RUNTIME_HOST=0.0.0.0` when another machine on the local network must reach the runtime, and point the Device UI at it with `NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL`.

## Spoken Responses

Spoken Responses are produced on the device side from the completed Prompt Exchange response text. The Brain Server does not play device audio.

Configure Device UI speech behavior with `NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES`:

- `voice-only`: Speak only Prompt Exchanges that were started by local voice input. This is the default.
- `always`: Speak voice-started and text-started Prompt Exchanges. Use this for testing or accessibility.
- `off`: Keep visible responses but disable Spoken Response playback.

When a selected Prompt Exchange completes, the Device UI asks the local Device Runtime to play the response. The Device Runtime starts the configured TTS command, which defaults to `say` on macOS and can be changed with `DEVICE_RUNTIME_TTS_COMMAND`.

Each new Spoken Response replaces the current Spoken Response on the same device. The Device UI sends playback requests with replacement enabled, and the Device Runtime cancels any active playback before starting the next response.

If the Device Runtime is unavailable, rejects a command, or closes before accepting playback, the Device UI logs a runtime warning. In development mode only, it then tries the browser `speechSynthesis` API as a fallback. If browser speech is also unavailable, the visible response remains usable and no audio is played. Production deployments should rely on the Device Runtime audio path rather than browser fallback.

To ask the Device UI questions through a logged-in Codex subscription, authenticate the Codex CLI on the same machine that runs the Brain Server:

```sh
codex login
```

Then set the Brain Server provider:

```sh
BRAIN_AI_PROVIDER=openai-codex
```

The `openai-codex` Subscription Provider uses the local Codex CLI as a runtime bridge. By default it runs `codex exec --ephemeral "<prompt>"`; override `BRAIN_CODEX_COMMAND`, `BRAIN_CODEX_ARGS`, or `BRAIN_CODEX_TIMEOUT_MS` if your Codex install needs a different command, profile, or timeout.

For lower local latency on macOS with the Codex desktop app installed, point directly at the bundled binary instead of launching through `npx`:

```sh
BRAIN_CODEX_COMMAND=/Applications/Codex.app/Contents/Resources/codex
BRAIN_CODEX_ARGS=exec --ephemeral
```

If your global `codex` wrapper is unavailable but `npx @openai/codex@latest exec` works, use:

```sh
BRAIN_CODEX_COMMAND=npx
BRAIN_CODEX_ARGS=-y @openai/codex@latest exec
```

To test direct OpenAI Platform API latency instead of the Codex CLI bridge, set:

```sh
BRAIN_AI_PROVIDER=openai-api
BRAIN_OPENAI_API_KEY=sk-...
```

The `openai-api` Provider uses the OpenAI Responses API and streams response text deltas into the existing Prompt Exchange flow. It defaults to `BRAIN_OPENAI_MODEL=gpt-5.5`, `BRAIN_OPENAI_REASONING_EFFORT=low`, and `BRAIN_OPENAI_VERBOSITY=low` for a latency-sensitive device assistant, and can be tuned through the environment settings below.

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
- `BRAIN_AI_PROVIDER`: AI Provider mode. Use `fake` for local development, `openai-codex` for the Codex CLI bridge, or `openai-api` for direct OpenAI Platform API calls.
- `BRAIN_DATA_DIR`: Directory for Brain Files and Interaction Logs.
- `BRAIN_CODEX_COMMAND`: Command used by the `openai-codex` bridge. Defaults to `codex`.
- `BRAIN_CODEX_ARGS`: Whitespace-separated arguments before the prompt. Defaults to `exec --ephemeral`.
- `BRAIN_CODEX_TIMEOUT_MS`: Bridge timeout in milliseconds. Defaults to `120000`.
- `BRAIN_OPENAI_API_KEY`: OpenAI Platform API key used by the `openai-api` Provider. Falls back to `OPENAI_API_KEY`.
- `BRAIN_OPENAI_BASE_URL`: OpenAI-compatible API base URL. Defaults to `https://api.openai.com/v1`.
- `BRAIN_OPENAI_MODEL`: Responses API model used by the `openai-api` Provider. Defaults to `gpt-5.5`.
- `BRAIN_OPENAI_TIMEOUT_MS`: Direct API request timeout in milliseconds. Defaults to `30000`.
- `BRAIN_OPENAI_REASONING_EFFORT`: Reasoning effort for the `openai-api` Provider. Defaults to `low`.
- `BRAIN_OPENAI_VERBOSITY`: Text verbosity for the `openai-api` Provider. Defaults to `low`.
- `DISCORD_WEBHOOK_URL`: Optional Issue Reporter destination for System Issues.

Device UI settings live in `apps/device-ui/.env`:

- `NEXT_PUBLIC_BRAIN_HTTP_URL`: Browser-visible Brain Server HTTP base URL.
- `NEXT_PUBLIC_BRAIN_WS_URL`: Browser-visible Brain Server WebSocket base URL.
- `NEXT_PUBLIC_DEVICE_RUNTIME_WS_URL`: Browser-visible local Device Runtime WebSocket base URL.
- `NEXT_PUBLIC_DEVICE_UI_MODE`: Set to `development` to enable the Option+T Development Wake Shortcut; plain `pnpm dev` also enables it through Next.js development mode.
- `NEXT_PUBLIC_DEVICE_UI_SPOKEN_RESPONSES`: Spoken Response mode. Use `voice-only`, `always`, or `off`. Defaults to `voice-only`.

Device Runtime settings:

- `DEVICE_RUNTIME_PORT`: Local Device Runtime WebSocket and health port. Defaults to `4318`.
- `DEVICE_RUNTIME_HOST`: Local Device Runtime host interface. Defaults to `127.0.0.1`.
- `DEVICE_RUNTIME_TTS_COMMAND`: Local TTS command used for Spoken Response playback. Defaults to `say`.

## Merge Gate

Run the local validation suite before opening or merging a PR:

```sh
pnpm validate
```

This runs linting, type validation, tests, and builds across the workspace.

Pull requests into `main` and `develop` are protected by the GitHub Merge Gate policy. See [docs/github-protected-branches.md](docs/github-protected-branches.md) for the required branch protection settings and the `gh` setup script.
