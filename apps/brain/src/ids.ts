import { randomUUID } from "node:crypto";
import type { PromptExchangeId, SystemIssueId } from "@open-nexus/protocol";

export function createPromptExchangeId(): PromptExchangeId {
  return `px_${randomUUID().replaceAll("-", "")}`;
}

export function createSystemIssueId(): SystemIssueId {
  return `si_${randomUUID().replaceAll("-", "")}`;
}
