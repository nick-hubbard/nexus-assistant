import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  type DeviceRuntimeServer,
  startDeviceRuntimeServer,
} from "../src/device-runtime-server.js";
import { createFakeTtsAdapter } from "../src/tts-adapter.js";

const servers: DeviceRuntimeServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("startDeviceRuntimeServer", () => {
  it("listens on the Device Runtime commands endpoint and performs TTS playback", async () => {
    const fakeTts = createFakeTtsAdapter();
    const server = await startDeviceRuntimeServer({ port: 0, ttsAdapter: fakeTts.adapter });
    servers.push(server);

    await sendCommand(server, {
      type: "prompt-exchange-response.speak",
      deviceId: "dev_kitchen1",
      promptExchangeId: "px_123456789012",
      responseText: "The lights are off.",
      replaceCurrent: true,
    });

    expect(fakeTts.spokenResponses).toEqual([
      expect.objectContaining({
        deviceId: "dev_kitchen1",
        promptExchangeId: "px_123456789012",
        responseText: "The lights are off.",
      }),
    ]);
  });

  it("rejects invalid spoken-response commands before playback", async () => {
    const fakeTts = createFakeTtsAdapter();
    const server = await startDeviceRuntimeServer({ port: 0, ttsAdapter: fakeTts.adapter });
    servers.push(server);

    const response = await sendCommand(server, {
      type: "prompt-exchange-response.speak",
      deviceId: "not-a-device-id",
      promptExchangeId: "px_123456789012",
      responseText: "The lights are off.",
      replaceCurrent: true,
    });

    expect(response).toEqual({ type: "command.rejected", reason: "invalid_command" });
    expect(fakeTts.spokenResponses).toEqual([]);
  });

  it("cancels the current Spoken Response when a replacement command arrives", async () => {
    const fakeTts = createFakeTtsAdapter();
    const server = await startDeviceRuntimeServer({ port: 0, ttsAdapter: fakeTts.adapter });
    servers.push(server);

    await sendCommand(server, {
      type: "prompt-exchange-response.speak",
      deviceId: "dev_kitchen1",
      promptExchangeId: "px_123456789012",
      responseText: "First response.",
      replaceCurrent: true,
    });
    await sendCommand(server, {
      type: "prompt-exchange-response.speak",
      deviceId: "dev_kitchen1",
      promptExchangeId: "px_abcdefghijkl",
      responseText: "Replacement response.",
      replaceCurrent: true,
    });

    expect(fakeTts.spokenResponses).toHaveLength(2);
    expect(fakeTts.cancellations).toEqual([
      expect.objectContaining({
        promptExchangeId: "px_123456789012",
        responseText: "First response.",
      }),
    ]);
  });
});

async function sendCommand(server: DeviceRuntimeServer, command: unknown) {
  const socket = new WebSocket(`${server.url}/commands`);
  await once(socket, "open");

  socket.send(JSON.stringify(command));
  const [data] = await once(socket, "message");
  socket.close();

  return JSON.parse(data.toString()) as unknown;
}

function once(socket: WebSocket, event: "open"): Promise<[]>;
function once(socket: WebSocket, event: "message"): Promise<[WebSocket.RawData]>;
function once(socket: WebSocket, event: "open" | "message") {
  return new Promise<unknown[]>((resolve, reject) => {
    socket.once("error", reject);
    socket.once(event, (...args) => {
      socket.off("error", reject);
      resolve(args);
    });
  });
}
