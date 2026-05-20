import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["data/**", "node_modules/**", "dist/**"],
  },
});
