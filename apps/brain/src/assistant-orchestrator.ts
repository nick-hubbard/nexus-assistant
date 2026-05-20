import { z } from "zod";
import type { AiProvider } from "./provider.js";
import type {
  InstalledSkill,
  SkillActionRequest,
  SkillActionResult,
  SkillHost,
} from "./skill-host.js";

const OrchestratorDecisionSchema = z
  .object({
    skillId: z.string().trim().min(1).nullable(),
    action: z.string().trim().min(1).nullable(),
    input: z.unknown().optional(),
    configuration: z.unknown().optional(),
  })
  .strict();

export interface AssistantOrchestratorResult {
  skillId: string;
  action: string;
  input: unknown;
  result: SkillActionResult;
}

export class AssistantOrchestrator {
  constructor(
    private readonly options: {
      provider: AiProvider;
      skillHost: SkillHost;
    },
  ) {}

  async invokeForPrompt(prompt: string): Promise<AssistantOrchestratorResult | undefined> {
    const installedSkills = await this.options.skillHost.discover();
    if (installedSkills.length === 0) {
      return undefined;
    }

    const decision = await this.selectSkillAction(prompt, installedSkills);
    if (!decision.skillId || !decision.action) {
      return undefined;
    }

    const skill = installedSkills.find((candidate) => candidate.manifest.id === decision.skillId);
    if (!skill) {
      return undefined;
    }

    const safetyRefusal = enforceSkillSafetyPolicy(skill, decision.action);
    if (safetyRefusal) {
      return {
        skillId: skill.manifest.id,
        action: decision.action,
        input: inputForSkill(decision.input, prompt),
        result: safetyRefusal,
      };
    }

    const request: SkillActionRequest = {
      action: decision.action,
      input: inputForSkill(decision.input, prompt),
    };
    const result = await this.options.skillHost.invoke(skill.manifest.id, request);

    return {
      skillId: skill.manifest.id,
      action: decision.action,
      input: request.input,
      result,
    };
  }

  private async selectSkillAction(prompt: string, installedSkills: InstalledSkill[]) {
    const fastDecision = selectFastSkillAction(prompt, installedSkills);
    if (fastDecision) {
      return fastDecision;
    }

    if (canSkipProviderSkillSelection(prompt, installedSkills)) {
      return { skillId: null, action: null };
    }

    const orchestratorPrompt = buildOrchestratorPrompt(prompt, installedSkills);
    const response = await collectProviderResponse(
      this.options.provider.complete({
        prompt: orchestratorPrompt,
        purpose: "skill-selection",
      }),
    );

    const decision = parseDecision(response);
    if (!decision) {
      return { skillId: null, action: null };
    }

    return decision;
  }
}

function selectFastSkillAction(prompt: string, installedSkills: InstalledSkill[]) {
  const homeAssistantSkill = installedSkills.find(
    (skill) => skill.manifest.id === "home-assistant",
  );
  if (!homeAssistantSkill) {
    return undefined;
  }

  const action = inferHomeAssistantAction(prompt);
  if (!action || !skillSupportsAction(homeAssistantSkill, action)) {
    return undefined;
  }

  return {
    skillId: homeAssistantSkill.manifest.id,
    action,
    input: { prompt },
  };
}

function inferHomeAssistantAction(prompt: string) {
  const normalized = normalizePrompt(prompt);
  const mentionsKnownEntityType =
    /\b(light|lights|switch|switches|scene|script|thermostat|temperature|climate)\b/.test(
      normalized,
    );

  if (/\b(turn|switch)\b.*\bon\b/.test(normalized) && mentionsKnownEntityType) {
    return /\b(switch|switches)\b/.test(normalized) && !/\b(light|lights)\b/.test(normalized)
      ? "switch-on"
      : "turn-on";
  }

  if (/\b(turn|switch)\b.*\boff\b/.test(normalized) && mentionsKnownEntityType) {
    return /\b(switch|switches)\b/.test(normalized) && !/\b(light|lights)\b/.test(normalized)
      ? "switch-off"
      : "turn-off";
  }

  if (/\b(set|change)\b.*\b(thermostat|temperature|climate)\b/.test(normalized)) {
    return "set-temperature";
  }

  if (/\b(activate|turn on|start)\b.*\bscene\b/.test(normalized)) {
    return "activate-scene";
  }

  if (/\b(run|start|turn on)\b.*\bscript\b/.test(normalized)) {
    return "run-script";
  }

  if (
    /\b(are|is|what|which|list|show|tell|status|state)\b/.test(normalized) &&
    mentionsKnownEntityType
  ) {
    return "read-state";
  }

  if (/\b(home assistant entities|available entities|what entities)\b/.test(normalized)) {
    return "discover-entities";
  }

  return undefined;
}

function canSkipProviderSkillSelection(prompt: string, installedSkills: InstalledSkill[]) {
  if (
    installedSkills.length === 0 ||
    installedSkills.some((skill) => skill.manifest.id !== "home-assistant")
  ) {
    return false;
  }

  return !mentionsHomeAssistantDomain(prompt);
}

function mentionsHomeAssistantDomain(prompt: string) {
  return /\b(home assistant|entity|entities|light|lights|switch|switches|scene|script|thermostat|temperature|climate|living room|kitchen|office|hallway|downstairs|upstairs)\b/.test(
    normalizePrompt(prompt),
  );
}

function skillSupportsAction(skill: InstalledSkill, action: string) {
  return skill.manifest.capabilities.some((capability) => capability.actions.includes(action));
}

function enforceSkillSafetyPolicy(
  skill: InstalledSkill,
  action: string,
): SkillActionResult | undefined {
  if (skill.manifest.safetyDefaults.disabledActions.includes(action)) {
    return {
      status: "refused",
      responseText: "That Skill action is disabled by its Skill Safety Policy.",
      error: { message: "Action disabled by Skill Safety Policy.", code: "action-disabled" },
    };
  }

  if (skill.manifest.safetyDefaults.confirmation === "required") {
    return {
      status: "refused",
      responseText: "That Skill action needs confirmation before I can run it.",
      error: {
        message: "Confirmation is required by Skill Safety Policy.",
        code: "confirmation-required",
      },
    };
  }

  return undefined;
}

function inputForSkill(input: unknown, prompt: string) {
  if (input === undefined || input === null) {
    return { prompt };
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  return { prompt, ...input };
}

function buildOrchestratorPrompt(prompt: string, installedSkills: InstalledSkill[]) {
  return [
    "You are the Brain Server Assistant Orchestrator.",
    "Decide whether an installed Skill should handle the user prompt.",
    "Use only the Skill Manifest capability metadata below.",
    "Return only JSON with keys: skillId, action, input.",
    'For input, prefer {"prompt": <the original user prompt>} unless a Skill capability clearly requires a more specific field.',
    "Do not invent input keys that are not documented by the Skill Manifest.",
    "Do not include Skill Configuration, credentials, base URLs, tokens, or secrets.",
    "Use null skillId and null action when no Skill should handle the prompt.",
    "",
    `User prompt: ${JSON.stringify(prompt)}`,
    "",
    "Installed Skill Manifests:",
    JSON.stringify(
      installedSkills.map((skill) => ({
        id: skill.manifest.id,
        name: skill.manifest.name,
        capabilities: skill.manifest.capabilities,
        safetyDefaults: skill.manifest.safetyDefaults,
      })),
    ),
  ].join("\n");
}

async function collectProviderResponse(chunks: AsyncGenerator<{ delta: string }>) {
  let response = "";
  for await (const chunk of chunks) {
    response += chunk.delta;
  }
  return response;
}

function parseDecision(response: string) {
  const trimmed = response.trim();
  const jsonText = trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    return undefined;
  }

  try {
    return OrchestratorDecisionSchema.parse(JSON.parse(jsonText));
  } catch {
    return undefined;
  }
}

function normalizePrompt(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
