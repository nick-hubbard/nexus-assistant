import { z } from "zod";

export interface SkillActionRequest {
  action: string;
  input: unknown;
  configuration?: unknown;
}

export interface SkillActionResult {
  status: "succeeded" | "failed" | "refused";
  responseText?: string;
  data?: unknown;
  error?: {
    message: string;
    code?: string;
  };
}

export interface SkillAdapter {
  invoke(request: SkillActionRequest): Promise<SkillActionResult> | SkillActionResult;
}

const SupportedDomainSchema = z.enum(["light", "switch", "scene", "script", "climate"]);
type SupportedDomain = z.infer<typeof SupportedDomainSchema>;

const ConfigurationSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .url()
      .regex(/^https?:\/\//, "Base URL must include http:// or https://."),
    accessToken: z.string().trim().min(1).optional(),
    accessTokenRef: z.string().trim().min(1).optional(),
    safetyPolicy: z
      .object({
        confirmation: z.enum(["not-required", "required"]).optional(),
        disabledActions: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type HomeAssistantSkillConfiguration = z.infer<typeof ConfigurationSchema>;

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

  async validateConfiguration(
    configurationValue: unknown,
  ): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
    const configuration = ConfigurationSchema.safeParse(configurationValue);
    if (!configuration.success) {
      return { ok: false, message: "Home Assistant configuration is invalid." };
    }

    const response = await this.fetchImpl(urlFor(configuration.data.baseUrl, "/api/config"), {
      headers: headersFor(configuration.data),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Home Assistant configuration check failed with ${response.status}.`,
        status: response.status,
      };
    }

    return { ok: true };
  }

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
    const discoveredEntities = discoverEntities(states);

    if (mappedAction.kind === "discover") {
      return {
        status: "succeeded",
        responseText: `I found ${discoveredEntities.length} Home Assistant entities.`,
        data: { entities: discoveredEntities },
      };
    }

    const domain = mappedAction.domain ?? inferDomain(input, states);
    if (!domain) {
      return failed(
        "I could not determine which Home Assistant entity type to read.",
        "entity-domain-not-found",
      );
    }

    const targets = resolveTargets(states, domain, input);

    if (targets.length === 0) {
      return failed(`I could not find a matching ${domain} in Home Assistant.`, "entity-not-found");
    }

    if (mappedAction.kind === "read") {
      return {
        status: "succeeded",
        responseText: readStateResponseText(targets),
        data: {
          entities: targets.map(entityContextForState),
        },
      };
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
        domain,
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
  kind: "control" | "discover" | "read";
  domain?: SupportedDomain;
  service?: string;
}

function mapAction(action: string): MappedAction | undefined {
  const normalized = normalize(action);
  if (["discover-entities", "discover_entities", "entities"].includes(normalized)) {
    return { kind: "discover" };
  }
  if (["read-state", "read_state", "state"].includes(normalized)) {
    return { kind: "read" };
  }
  if (["turn-off", "turn_off", "off"].includes(normalized)) {
    return { kind: "control", domain: "light", service: "turn_off" };
  }
  if (["turn-on", "turn_on", "on"].includes(normalized)) {
    return { kind: "control", domain: "light", service: "turn_on" };
  }
  if (["switch-off", "switch_off"].includes(normalized)) {
    return { kind: "control", domain: "switch", service: "turn_off" };
  }
  if (["switch-on", "switch_on"].includes(normalized)) {
    return { kind: "control", domain: "switch", service: "turn_on" };
  }
  if (["activate-scene", "scene-on"].includes(normalized)) {
    return { kind: "control", domain: "scene", service: "turn_on" };
  }
  if (["run-script", "script-on"].includes(normalized)) {
    return { kind: "control", domain: "script", service: "turn_on" };
  }
  if (["set-temperature", "climate-temperature"].includes(normalized)) {
    return { kind: "control", domain: "climate", service: "set_temperature" };
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
  if (searchTerms.length === 0 || searchTerms.some((term) => /\ball\b/i.test(term))) {
    return domainStates;
  }

  const meaningfulWords = searchTerms.flatMap(meaningfulEntityWords);
  if (meaningfulWords.length === 0) {
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
    return meaningfulWords.every((term) => haystack.includes(term));
  });
}

function discoverEntities(states: HomeAssistantState[]) {
  return states.map(entityContextForState);
}

function entityContextForState(state: HomeAssistantState) {
  return {
    entityId: state.entity_id,
    domain: state.entity_id.split(".")[0],
    state: state.state,
    friendlyName: state.attributes.friendly_name,
    area: state.attributes.area,
    areaId: state.attributes.area_id,
  };
}

function inferDomain(input: z.infer<typeof ActionInputSchema>, states: HomeAssistantState[]) {
  if (input.entityId) {
    const domain = input.entityId.split(".")[0];
    return SupportedDomainSchema.safeParse(domain).success
      ? (domain as SupportedDomain)
      : undefined;
  }

  const haystack = normalize([input.area, input.name, input.prompt].filter(Boolean).join(" "));
  if (/\blights?\b/.test(haystack)) {
    return "light";
  }
  if (/\bswitch(?:es)?\b/.test(haystack)) {
    return "switch";
  }
  if (/\bclimate\b|\bthermostat\b|\btemperature\b/.test(haystack)) {
    return "climate";
  }

  const matchingDomains = states
    .map((state) => state.entity_id.split(".")[0])
    .filter((domain): domain is SupportedDomain => SupportedDomainSchema.safeParse(domain).success);
  return matchingDomains.length === 1 ? matchingDomains[0] : undefined;
}

function meaningfulEntityWords(term: string) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 0 &&
        !new Set([
          "a",
          "an",
          "are",
          "is",
          "the",
          "to",
          "turn",
          "set",
          "read",
          "what",
          "on",
          "off",
          "state",
          "status",
          "light",
          "lights",
          "switch",
          "switches",
        ]).has(word),
    );
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

function readStateResponseText(targets: HomeAssistantState[]) {
  if (targets.length === 1) {
    const target = targets[0];
    if (!target) {
      return "I could not find a matching Home Assistant entity.";
    }
    return `${target.attributes.friendly_name ?? target.entity_id} is ${target.state}.`;
  }

  const states = targets
    .map((target) => `${target.attributes.friendly_name ?? target.entity_id} is ${target.state}`)
    .join(", ");
  return states.endsWith(".") ? states : `${states}.`;
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
