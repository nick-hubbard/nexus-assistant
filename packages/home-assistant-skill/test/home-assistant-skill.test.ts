import { describe, expect, it } from "vitest";
import { HomeAssistantSkill } from "../src/index.js";

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

  it("accepts query as a prompt alias for model-selected Skill input", async () => {
    const skill = new HomeAssistantSkill(async () =>
      jsonResponse([
        {
          entity_id: "light.kitchen",
          state: "on",
          attributes: { friendly_name: "Kitchen lights", area: "Kitchen" },
        },
      ]),
    );

    const result = await skill.invoke({
      action: "read-state",
      input: { query: "are the kitchen lights on?" },
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Kitchen lights is on.",
    });
  });

  it("accepts a raw prompt string for model-selected Skill input", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const skill = new HomeAssistantSkill(async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/api/states")) {
        return jsonResponse([
          {
            entity_id: "light.kitchen",
            state: "off",
            attributes: { friendly_name: "Kitchen lights", area: "Kitchen" },
          },
          {
            entity_id: "light.living_room",
            state: "off",
            attributes: { friendly_name: "Living room lights", area: "Living Room" },
          },
        ]);
      }
      return jsonResponse([]);
    });

    const result = await skill.invoke({
      action: "turn-on",
      input: "Turn on the living room lights",
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Done, I turned on Living room lights.",
      data: {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.living_room"],
      },
    });
    expect(requests[1]).toMatchObject({
      url: "http://ha.local:8123/api/services/light/turn_on",
      init: {
        method: "POST",
        body: JSON.stringify({ entity_id: ["light.living_room"] }),
      },
    });
  });

  it("ignores unknown model-selected Skill input fields", async () => {
    const skill = new HomeAssistantSkill(async () => jsonResponse([]));

    const result = await skill.invoke({
      action: "read-state",
      input: { unsupported: "kitchen" },
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "failed",
      responseText: "I could not determine which Home Assistant entity type to read.",
      error: { code: "entity-domain-not-found" },
    });
  });

  it("falls back to all lights when model-selected input only includes unknown fields", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const skill = new HomeAssistantSkill(async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/api/states")) {
        return jsonResponse([
          {
            entity_id: "light.kitchen",
            state: "off",
            attributes: { friendly_name: "Kitchen lights", area: "Kitchen" },
          },
          {
            entity_id: "light.living_room",
            state: "off",
            attributes: { friendly_name: "Living room lights", area: "Living Room" },
          },
        ]);
      }
      return jsonResponse([]);
    });

    const result = await skill.invoke({
      action: "turn-on",
      input: { device: "lights" },
      configuration: { baseUrl: "http://ha.local:8123" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      responseText: "Done, I turned on Kitchen lights, Living room lights.",
      data: {
        domain: "light",
        service: "turn_on",
        entityIds: ["light.kitchen", "light.living_room"],
      },
    });
    expect(requests[1]).toMatchObject({
      url: "http://ha.local:8123/api/services/light/turn_on",
      init: {
        method: "POST",
        body: JSON.stringify({ entity_id: ["light.kitchen", "light.living_room"] }),
      },
    });
  });

  it("discovers light entities by friendly name and calls the turn-off service", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const skill = new HomeAssistantSkill(async (url, init) => {
      requests.push({ url: String(url), init });
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

  it("validates configuration by calling a Home Assistant-compatible config endpoint", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const skill = new HomeAssistantSkill(async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({ version: "2026.5.0" });
    });

    await expect(
      skill.validateConfiguration({
        baseUrl: "http://ha.local:8123/",
        accessToken: "token",
      }),
    ).resolves.toEqual({ ok: true });
    expect(requests).toMatchObject([
      {
        url: "http://ha.local:8123/api/config",
        init: {
          headers: {
            authorization: "Bearer token",
          },
        },
      },
    ]);
  });

  it("rejects invalid configuration before contacting Home Assistant", async () => {
    let requestCount = 0;
    const skill = new HomeAssistantSkill(async () => {
      requestCount += 1;
      return jsonResponse({});
    });

    await expect(skill.validateConfiguration({ baseUrl: "ha.local:8123" })).resolves.toEqual({
      ok: false,
      message: "Home Assistant configuration is invalid.",
    });
    expect(requestCount).toBe(0);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
