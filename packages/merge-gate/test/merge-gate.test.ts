import { describe, expect, it } from "vitest";
import { mergeGateChecks } from "../src/index.js";

describe("mergeGateChecks", () => {
  it("captures the required local validation steps", () => {
    expect(mergeGateChecks()).toEqual(["lint", "check-types", "test", "build"]);
  });
});
