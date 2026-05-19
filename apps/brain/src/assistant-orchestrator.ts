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
        result: safetyRefusal,
      };
    }

    const request: SkillActionRequest = {
      action: decision.action,
      input: decision.input ?? { prompt },
      ...(decision.configuration === undefined ? {} : { configuration: decision.configuration }),
    };

    return {
      skillId: skill.manifest.id,
      action: decision.action,
      result: await this.options.skillHost.invoke(skill.manifest.id, request),
    };
  }

  private async selectSkillAction(prompt: string, installedSkills: InstalledSkill[]) {
    const response = await collectProviderResponse(
      this.options.provider.complete({
        prompt: buildOrchestratorPrompt(prompt, installedSkills),
      }),
    );

    const decision = parseDecision(response);
    if (!decision) {
      return { skillId: null, action: null };
    }

    return decision;
  }
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

function buildOrchestratorPrompt(prompt: string, installedSkills: InstalledSkill[]) {
  return [
    "You are the Brain Server Assistant Orchestrator.",
    "Decide whether an installed Skill should handle the user prompt.",
    "Use only the Skill Manifest capability metadata below.",
    "Return only JSON with keys: skillId, action, input, configuration.",
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
        configurationSchema: skill.manifest.configurationSchema,
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
