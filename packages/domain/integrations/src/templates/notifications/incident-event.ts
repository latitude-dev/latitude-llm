import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
import {
  actionsLink,
  COLORS,
  contextLine,
  header,
  projectOrOrgContext,
  sectionMarkdown,
  severityEmoji,
} from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const KIND_NAME: Record<string, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Issue regressed",
  "issue.escalating": "Issue escalating",
}

const KIND_COLOR: Record<string, string> = {
  "issue.new": COLORS.newIssue,
  "issue.regressed": COLORS.regressed,
  "issue.escalating": COLORS.escalating,
}

export const incidentEventRenderer: SlackNotificationRenderer<"incident.event"> = (payload, ctx) =>
  Effect.gen(function* () {
    const name = KIND_NAME[payload.incidentKind] ?? "Incident"
    const color = KIND_COLOR[payload.incidentKind] ?? COLORS.newIssue
    const sev = severityEmoji(payload.severity)
    const issueUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`
      : ctx.webAppUrl

    const issues = yield* IssueRepository
    const issueName = yield* issues
      .findById(IssueId(payload.sourceId))
      .pipe(
        Effect.map((i) => i.name),
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
      )

    const tags = payload.tags ?? []

    return {
      text: `${name} in ${ctx.project?.name ?? ctx.organization.name}${issueName ? `: ${issueName}` : ""}`,
      color,
      blocks: [
        header(`${name} · ${ctx.project?.name ?? ctx.organization.name}`),
        ...(issueName ? [sectionMarkdown(`*<${issueUrl}|${issueName}>*`)] : []),
        sectionMarkdown(
          issueName
            ? `A new <${issueUrl}|issue> has been detected.`
            : `A new issue has been detected.`,
        ),
        ...(payload.sampleExcerpt?.text
          ? [sectionMarkdown(`\`\`\`\n${payload.sampleExcerpt.text}\n\`\`\``)]
          : []),
        ...(tags.length > 0 ? [sectionMarkdown(tags.map((t) => `\`${t}\``).join("  "))] : []),
        contextLine(
          `${sev} ${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
        ),
        actionsLink("View issue", issueUrl),
      ],
    }
  })
