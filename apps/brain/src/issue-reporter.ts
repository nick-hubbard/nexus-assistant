import type { SystemIssue } from "@open-nexus/protocol";

export interface IssueReport {
  systemIssue: SystemIssue;
  correlationId: string;
}

export interface IssueReporter {
  report(issueReport: IssueReport): Promise<void>;
}

export class DisabledIssueReporter implements IssueReporter {
  async report(_issueReport: IssueReport) {
    return;
  }
}

export class DiscordIssueReporter implements IssueReporter {
  constructor(private readonly webhookUrl: string) {}

  async report(issueReport: IssueReport) {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: formatDiscordSystemIssue(issueReport),
        allowed_mentions: {
          parse: [],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook returned ${response.status}.`);
    }
  }
}

export function createIssueReporter(webhookUrl: string | undefined): IssueReporter {
  return webhookUrl ? new DiscordIssueReporter(webhookUrl) : new DisabledIssueReporter();
}

export function correlationIdForSystemIssue(systemIssue: SystemIssue) {
  return systemIssue.promptExchangeId ?? systemIssue.systemIssueId;
}

function formatDiscordSystemIssue(issueReport: IssueReport) {
  const issue = issueReport.systemIssue;
  const context = [
    `Correlation ID: ${issueReport.correlationId}`,
    issue.deviceId ? `Device ID: ${issue.deviceId}` : undefined,
    issue.promptExchangeId ? `Prompt Exchange ID: ${issue.promptExchangeId}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `**Open Nexus System Issue**`,
    `Severity: ${issue.severity}`,
    `Source: ${issue.source}`,
    `Category: ${issue.category}`,
    `Message: ${issue.message}`,
    context,
  ].join("\n");
}
