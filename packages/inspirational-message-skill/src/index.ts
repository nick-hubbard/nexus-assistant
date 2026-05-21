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

const ConfigurationSchema = z
  .object({
    title: z.string().trim().min(1).default("Good morning"),
    messages: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .strict();

const supportedActions = new Set(["display-random-message"]);

const defaultMessages = [
  "Start where you are. Use what you have. Do what you can.",
  "Small steps count. Take the next useful one.",
  "Make today a little more useful than yesterday.",
  "Focus on what you can move, then move it with care.",
  "Begin before it feels perfect.",
  "A steady morning can change the shape of the whole day.",
  "Do the kind thing. Do the clear thing. Keep going.",
  "Your attention is powerful. Spend it on purpose.",
];

export class InspirationalMessageSkill implements SkillAdapter {
  invoke(request: SkillActionRequest): SkillActionResult {
    if (!supportedActions.has(request.action)) {
      return failed(
        `Inspirational Message action '${request.action}' is not supported.`,
        "unsupported-action",
      );
    }

    const configuration = ConfigurationSchema.safeParse(request.configuration ?? {});
    if (!configuration.success) {
      return failed("Inspirational Message configuration is invalid.", "invalid-configuration");
    }

    const messages = configuration.data.messages ?? defaultMessages;
    const message = messages[randomIndex(messages.length)];

    return {
      status: "succeeded",
      responseText: "Displayed an inspirational message.",
      data: {
        displayMessage: {
          messageId: createDeviceMessageId(),
          title: configuration.data.title,
          message,
          variant: "inspiration",
        },
      },
    };
  }
}

function randomIndex(length: number) {
  return Math.floor(Math.random() * length);
}

function createDeviceMessageId() {
  return `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function failed(message: string, code: string): SkillActionResult {
  return {
    status: "failed",
    responseText: message,
    error: { message, code },
  };
}

export const skill = new InspirationalMessageSkill();
export default skill;
