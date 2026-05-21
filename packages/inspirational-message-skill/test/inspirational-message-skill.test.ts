import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationalMessageSkill } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InspirationalMessageSkill", () => {
  it("returns a display message payload for heartbeat publication", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    vi.spyOn(Date, "now").mockReturnValue(1_779_276_000_000);

    const result = new InspirationalMessageSkill().invoke({
      action: "display-random-message",
      input: undefined,
      configuration: {
        title: "Rise and shine",
        messages: ["Keep going."],
      },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Displayed an inspirational message.",
      data: {
        displayMessage: {
          title: "Rise and shine",
          message: "Keep going.",
          variant: "inspiration",
        },
      },
    });
    const messageId = (result.data as { displayMessage: { messageId: string } }).displayMessage
      .messageId;
    expect(messageId).toMatch(/^dm_[a-zA-Z0-9_-]{12,64}$/);
  });

  it("rejects unsupported actions", () => {
    expect(
      new InspirationalMessageSkill().invoke({
        action: "compose-poem",
        input: undefined,
      }),
    ).toMatchObject({
      status: "failed",
      error: { code: "unsupported-action" },
    });
  });
});
