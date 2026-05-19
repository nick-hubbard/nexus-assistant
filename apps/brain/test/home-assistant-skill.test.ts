import { describe, expect, it } from "vitest";
import { HomeAssistantSkill } from "../src/home-assistant-skill.js";

describe("Home Assistant Skill", () => {
  it("discovers entities with natural-language resolution context", async () => {
    const skill = new HomeAssistantSkill(async () =>
      jsonResponse([
        {
          entity_id: "light.kitchen",
          state: "on",
          attributes: {
            friendly_name: "Kitchen lights",
            area: "Kitchen",
            area_id: "kitchen",
          },
        },
      ]),
    );

    const result = await skill.invoke({
      action: "discover-entities",
      input: {},
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "I found 1 Home Assistant entities.",
      data: {
        entities: [
          {
            entityId: "light.kitchen",
            domain: "light",
            state: "on",
            friendlyName: "Kitchen lights",
            area: "Kitchen",
            areaId: "kitchen",
          },
        ],
      },
    });
  });

  it("reads current entity state by area and friendly name", async () => {
    const skill = new HomeAssistantSkill(async () =>
      jsonResponse([
        {
          entity_id: "light.kitchen",
          state: "on",
          attributes: { friendly_name: "Kitchen lights", area: "Kitchen" },
        },
        {
          entity_id: "light.living_room",
          state: "off",
          attributes: { friendly_name: "Living room lights", area: "Living Room" },
        },
      ]),
    );

    const result = await skill.invoke({
      action: "read-state",
      input: { prompt: "are the kitchen lights on?" },
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Kitchen lights is on.",
      data: {
        entities: [
          {
            entityId: "light.kitchen",
            domain: "light",
            state: "on",
            friendlyName: "Kitchen lights",
            area: "Kitchen",
          },
        ],
      },
    });
  });

  it("discovers light entities by friendly name and calls the turn-off service", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const skill = new HomeAssistantSkill(async (url, init) => {
      requests.push(init ? { url: String(url), init } : { url: String(url) });
      if (String(url).endsWith("/api/states")) {
        return jsonResponse([
          {
            entity_id: "light.kitchen",
            state: "on",
            attributes: { friendly_name: "Kitchen lights", area: "Kitchen" },
          },
          {
            entity_id: "switch.coffee",
            state: "off",
            attributes: { friendly_name: "Coffee machine", area: "Kitchen" },
          },
        ]);
      }
      return jsonResponse([]);
    });

    const result = await skill.invoke({
      action: "turn-off",
      input: { name: "kitchen lights" },
      configuration: {
        baseUrl: "http://ha.local:8123",
        accessToken: "token",
      },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Done, I turned off Kitchen lights.",
      data: {
        domain: "light",
        service: "turn_off",
        entityIds: ["light.kitchen"],
      },
    });
    expect(requests[1]).toMatchObject({
      url: "http://ha.local:8123/api/services/light/turn_off",
      init: {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ entity_id: ["light.kitchen"] }),
      },
    });
  });

  it("refuses disabled actions and confirmation-gated actions from safety policy overrides", async () => {
    const skill = new HomeAssistantSkill(async () => jsonResponse([]));

    await expect(
      skill.invoke({
        action: "turn-off",
        input: { entityId: "light.kitchen" },
        configuration: {
          baseUrl: "http://ha.local:8123",
          safetyPolicy: { disabledActions: ["turn-off"] },
        },
      }),
    ).resolves.toMatchObject({
      status: "refused",
      error: { code: "action-disabled" },
    });

    await expect(
      skill.invoke({
        action: "turn-off",
        input: { entityId: "light.kitchen" },
        configuration: {
          baseUrl: "http://ha.local:8123",
          safetyPolicy: { confirmation: "required" },
        },
      }),
    ).resolves.toMatchObject({
      status: "refused",
      error: { code: "confirmation-required" },
    });
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
