import { z } from "zod";
import type { SkillActionRequest, SkillActionResult, SkillAdapter } from "./skill-host.js";

const SupportedDomainSchema = z.enum(["light", "switch", "scene", "script", "climate"]);
type SupportedDomain = z.infer<typeof SupportedDomainSchema>;

const ConfigurationSchema = z
  .object({
    baseUrl: z.string().trim().min(1),
    accessToken: z.string().trim().min(1).optional(),
    safetyPolicy: z
      .object({
        confirmation: z.enum(["not-required", "required"]).optional(),
        disabledActions: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const ActionInputSchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
    entityId: z.string().trim().min(1).optional(),
    area: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    temperature: z.number().optional(),
  })
  .strict()
  .default({});

const HomeAssistantStateSchema = z
  .object({
    entity_id: z.string().trim().min(1),
    state: z.string(),
    attributes: z
      .object({
        friendly_name: z.string().optional(),
        area: z.string().optional(),
        area_id: z.string().optional(),
      })
      .passthrough()
      .default({}),
  })
  .passthrough();

type HomeAssistantState = z.infer<typeof HomeAssistantStateSchema>;

export class HomeAssistantSkill implements SkillAdapter {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async invoke(request: SkillActionRequest): Promise<SkillActionResult> {
    const configuration = ConfigurationSchema.safeParse(request.configuration);
    if (!configuration.success) {
      return failed("Home Assistant is not configured.", "home-assistant.configuration");
    }

    const mappedAction = mapAction(request.action);
    if (!mappedAction) {
      return failed(
        `Home Assistant action '${request.action}' is not supported.`,
        "unsupported-action",
      );
    }

    const safetyPolicy = configuration.data.safetyPolicy;
    if (safetyPolicy?.disabledActions?.includes(request.action)) {
      return {
        status: "refused",
        responseText: `Home Assistant action '${request.action}' is disabled by policy.`,
        error: { message: "Action disabled by Skill Safety Policy.", code: "action-disabled" },
      };
    }
    if (safetyPolicy?.confirmation === "required") {
      return {
        status: "refused",
        responseText: `Please confirm before I ${describeAction(mappedAction)}.`,
        error: {
          message: "Confirmation is required by Skill Safety Policy.",
          code: "confirmation-required",
        },
      };
    }

    const input = ActionInputSchema.parse(request.input);
    const states = await this.fetchStates(configuration.data);
    const targets = resolveTargets(states, mappedAction.domain, input);

    if (targets.length === 0) {
      return failed(
        `I could not find a matching ${mappedAction.domain} in Home Assistant.`,
        "entity-not-found",
      );
    }

    const serviceData: Record<string, unknown> = {
      entity_id: targets.map((target) => target.entity_id),
    };
    if (mappedAction.service === "set_temperature" && input.temperature !== undefined) {
      serviceData.temperature = input.temperature;
    }

    const serviceResponse = await this.callService(configuration.data, mappedAction, serviceData);
    if (!serviceResponse.ok) {
      return failed(
        `Home Assistant could not ${describeAction(mappedAction)}.`,
        "service-call-failed",
        serviceResponse.status,
      );
    }

    return {
      status: "succeeded",
      responseText: responseTextFor(mappedAction, targets),
      data: {
        domain: mappedAction.domain,
        service: mappedAction.service,
        entityIds: targets.map((target) => target.entity_id),
      },
    };
  }

  private async fetchStates(configuration: z.infer<typeof ConfigurationSchema>) {
    const response = await this.fetchImpl(urlFor(configuration.baseUrl, "/api/states"), {
      headers: headersFor(configuration),
    });
    if (!response.ok) {
      throw new Error(`Home Assistant states request failed with ${response.status}.`);
    }

    const value = await response.json();
    return z.array(HomeAssistantStateSchema).parse(value);
  }

  private async callService(
    configuration: z.infer<typeof ConfigurationSchema>,
    action: MappedAction,
    serviceData: Record<string, unknown>,
  ) {
    return this.fetchImpl(
      urlFor(configuration.baseUrl, `/api/services/${action.domain}/${action.service}`),
      {
        method: "POST",
        headers: {
          ...headersFor(configuration),
          "content-type": "application/json",
        },
        body: JSON.stringify(serviceData),
      },
    );
  }
}

interface MappedAction {
  domain: SupportedDomain;
  service: string;
}

function mapAction(action: string): MappedAction | undefined {
  const normalized = normalize(action);
  if (["turn-off", "turn_off", "off"].includes(normalized)) {
    return { domain: "light", service: "turn_off" };
  }
  if (["turn-on", "turn_on", "on"].includes(normalized)) {
    return { domain: "light", service: "turn_on" };
  }
  if (["switch-off", "switch_off"].includes(normalized)) {
    return { domain: "switch", service: "turn_off" };
  }
  if (["switch-on", "switch_on"].includes(normalized)) {
    return { domain: "switch", service: "turn_on" };
  }
  if (["activate-scene", "scene-on"].includes(normalized)) {
    return { domain: "scene", service: "turn_on" };
  }
  if (["run-script", "script-on"].includes(normalized)) {
    return { domain: "script", service: "turn_on" };
  }
  if (["set-temperature", "climate-temperature"].includes(normalized)) {
    return { domain: "climate", service: "set_temperature" };
  }
  return undefined;
}

function resolveTargets(
  states: HomeAssistantState[],
  domain: SupportedDomain,
  input: z.infer<typeof ActionInputSchema>,
) {
  const domainStates = states.filter((state) => state.entity_id.startsWith(`${domain}.`));
  if (input.entityId) {
    return domainStates.filter((state) => state.entity_id === input.entityId);
  }

  const searchTerms = [input.area, input.name, input.prompt].filter((term): term is string =>
    Boolean(term),
  );
  if (searchTerms.length === 0 || searchTerms.some((term) => /\ball\b|\blights?\b/i.test(term))) {
    return domainStates;
  }

  return domainStates.filter((state) => {
    const haystack = normalize(
      [
        state.entity_id,
        state.attributes.friendly_name,
        state.attributes.area,
        state.attributes.area_id,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return searchTerms.some((term) => haystack.includes(normalize(term)));
  });
}

function headersFor(configuration: z.infer<typeof ConfigurationSchema>) {
  return configuration.accessToken ? { authorization: `Bearer ${configuration.accessToken}` } : {};
}

function urlFor(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function responseTextFor(action: MappedAction, targets: HomeAssistantState[]) {
  const names = targets
    .map((target) => target.attributes.friendly_name ?? target.entity_id)
    .join(", ");
  return `Done, I ${pastTense(action)} ${names}.`;
}

function describeAction(action: MappedAction) {
  if (action.service === "turn_off") {
    return `turn off the ${action.domain}`;
  }
  if (action.service === "turn_on") {
    return `turn on the ${action.domain}`;
  }
  return `update the ${action.domain}`;
}

function pastTense(action: MappedAction) {
  if (action.service === "turn_off") {
    return "turned off";
  }
  if (action.service === "turn_on") {
    return "turned on";
  }
  return "updated";
}

function failed(responseText: string, code: string, status?: number): SkillActionResult {
  return {
    status: "failed",
    responseText,
    error: {
      message: responseText,
      code: status ? `${code}.${status}` : code,
    },
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .trim();
}

export const skill = new HomeAssistantSkill();
export default skill;
