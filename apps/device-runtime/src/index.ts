#!/usr/bin/env tsx
import "dotenv/config";
import { startDeviceRuntimeServer } from "./device-runtime-server.js";

startDeviceRuntimeServer()
  .then((server) => {
    console.log(`Device Runtime listening at ${server.url}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Device Runtime failed to start.");
    process.exitCode = 1;
  });
