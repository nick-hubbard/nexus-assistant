import { randomUUID } from "node:crypto";
import type { PromptExchangeId } from "@open-nexus/protocol";

export function createPromptExchangeId(): PromptExchangeId {
  return `px_${randomUUID().replaceAll("-", "")}`;
}
