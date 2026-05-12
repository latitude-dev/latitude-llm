import { OrganizationId, ProjectId } from "@domain/shared"
import type { Report } from "@domain/spans"
import { Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../components/EmailHeading.tsx"
import { WrappedLayout } from "../../components/WrappedLayout.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"
import { Heatmap } from "./-components/Heatmap.tsx"
import { MomentCard } from "./-components/MomentCard.tsx"
import { PersonalityCard, type PersonalityKindLocal } from "./-components/PersonalityCard.tsx"
import { RankList } from "./-components/RankList.tsx"
import { StatCard } from "./-components/StatCard.tsx"
import { ToolMixBar, type ToolMixSegment } from "./-components/ToolMixBar.tsx"
import { WorkspaceCard } from "./-components/WorkspaceCard.tsx"

interface ClaudeCodeWrappedEmailProps {
  readonly userName: string
  readonly report: Report
  /**
   * Absolute base URL where the personality PNGs live (no trailing slash).
   * Production wires this to `https://console.latitude.so/email-branding/claude-code-wrapped/personalities`.
   */
  readonly imageBaseUrl: string
}

const DATE_RANGE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

const formatRange = (start: Date, end: Date): string =>
  `${DATE_RANGE_FMT.format(start)} – ${DATE_RANGE_FMT.format(end)}`

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "0m"
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

const formatCompact = (n: number): string => n.toLocaleString("en-US")

const formatBusiestDay = (date: string): string => {
  // The query returns YYYY-MM-DD UTC. Parse explicitly so we don't slip into
  // the local timezone (Outlook's Date handling is unforgiving).
  const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10))
  if (!y || !m || !d) return date
  const utc = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc)
}

// Tool-mix segment colors — built on the claude.accent ramp with the cream
// background as the neutral. Order matches the legend order.
const TOOL_MIX_PALETTE: Record<string, { label: string; color: string }> = {
  bash: { label: "Bash", color: "#D97555" },
  read: { label: "Read", color: "#C97A3C" },
  edit: { label: "Edit", color: "#A66A4D" },
  write: { label: "Write", color: "#7E5246" },
  search: { label: "Search", color: "#BE9580" },
  plan: { label: "Plan", color: "#7C8B5D" },
  other: { label: "Other", color: "#A9A39A" },
}

const buildToolMixSegments = (mix: Report["toolMix"]): readonly ToolMixSegment[] =>
  (Object.keys(TOOL_MIX_PALETTE) as Array<keyof typeof TOOL_MIX_PALETTE>).map((bucket) => ({
    label: TOOL_MIX_PALETTE[bucket].label,
    color: TOOL_MIX_PALETTE[bucket].color,
    count: mix[bucket as keyof Report["toolMix"]],
  }))

// ─────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginTop: "32px",
}

const sectionSubtitleStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "13px",
  color: emailDesignTokens.colors.claude.mutedInk,
  marginTop: "6px",
  marginBottom: "16px",
}

function HeroSection({ userName, report }: { userName: string; report: Report }) {
  return (
    <Section style={{ paddingTop: "16px", paddingBottom: "8px", textAlign: "center" }}>
      <EmailHeading variant="display">{`Hi ${userName}, your Claude Code week`}</EmailHeading>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "15px",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginTop: "10px",
          marginBottom: 0,
        }}
      >
        {`${report.project.name} · ${formatRange(report.window.start, report.window.end)} (UTC)`}
      </p>
    </Section>
  )
}

function HeadlineNumbersGrid({ totals }: { totals: Report["totals"] }) {
  return (
    <Section style={sectionStyle}>
      <table
        cellPadding={0}
        cellSpacing={8}
        border={0}
        role="presentation"
        style={{ width: "100%", borderCollapse: "separate" }}
      >
        <tbody>
          <tr>
            <StatCard label="Sessions" value={formatCompact(totals.sessions)} />
            <StatCard label="Claude time" value={formatDuration(totals.durationMs)} />
            <StatCard label="Files touched" value={formatCompact(totals.filesTouched)} />
            <StatCard label="Commands" value={formatCompact(totals.commandsRun)} />
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

function BreadthStrip({ totals }: { totals: Report["totals"] }) {
  const parts: string[] = []
  if (totals.workspaces > 0) parts.push(`${formatCompact(totals.workspaces)} workspaces`)
  if (totals.branches > 0) parts.push(`${formatCompact(totals.branches)} branches`)
  if (totals.commits > 0) parts.push(`${formatCompact(totals.commits)} commits`)
  if (totals.repos > 0) parts.push(`${formatCompact(totals.repos)} repos`)
  if (parts.length === 0) return null
  return (
    <Section style={{ marginTop: "12px", textAlign: "center" }}>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "13px",
          color: emailDesignTokens.colors.claude.mutedInk,
          margin: 0,
        }}
      >
        {parts.join(" · ")}
      </p>
    </Section>
  )
}

function ToolMixSection({ mix }: { mix: Report["toolMix"] }) {
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">Tool mix</EmailHeading>
      <p style={sectionSubtitleStyle}>How Claude Code split its work this week.</p>
      <ToolMixBar segments={buildToolMixSegments(mix)} />
    </Section>
  )
}

function TopFilesSection({ files }: { files: Report["topFiles"] }) {
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">Top files</EmailHeading>
      <p style={sectionSubtitleStyle}>The files Claude returned to most often.</p>
      <RankList
        emptyHint="No file activity recorded."
        items={files.map((file) => ({
          primary: file.displayName,
          secondary: file.path,
          trailing: `${formatCompact(file.touches)}×`,
        }))}
      />
    </Section>
  )
}

function TopBashCommandsSection({ commands }: { commands: Report["topBashCommands"] }) {
  if (commands.length === 0) return null
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">Top commands</EmailHeading>
      <p style={sectionSubtitleStyle}>Grouped by the first token of each bash invocation.</p>
      <RankList
        items={commands.map((c) => ({
          primary: c.pattern,
          trailing: `${formatCompact(c.count)} runs`,
        }))}
      />
    </Section>
  )
}

function WorkspacesSection({ deepDives, otherCount }: { deepDives: Report["workspaceDeepDives"]; otherCount: number }) {
  if (deepDives.length === 0) return null
  const single = deepDives.length === 1
  const title = single && deepDives[0] ? `Your week in ${deepDives[0].name}` : "Workspaces"
  const subtitle = single
    ? "Your one and only this week."
    : `Where Claude spent the most time${otherCount > 0 ? ` — plus ${otherCount} more workspaces` : ""}.`
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">{title}</EmailHeading>
      <p style={sectionSubtitleStyle}>{subtitle}</p>
      {deepDives.map((ws) => (
        <WorkspaceCard
          key={ws.name}
          name={ws.name}
          sessions={ws.sessions}
          toolCalls={ws.toolCalls}
          topFiles={ws.topFiles}
          topBranches={ws.topBranches}
          dominantTool={ws.dominantTool}
        />
      ))}
      {!single && otherCount > 0 ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "12px",
            color: emailDesignTokens.colors.claude.mutedInk,
            marginTop: "4px",
          }}
        >
          {`You also touched ${otherCount} other workspace${otherCount === 1 ? "" : "s"}.`}
        </p>
      ) : null}
    </Section>
  )
}

function HeatmapSection({ heatmap }: { heatmap: Report["heatmap"] }) {
  const hasActivity = heatmap.some((row) => row.some((cell) => cell > 0))
  if (!hasActivity) return null
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">Your week, hour by hour</EmailHeading>
      <p style={sectionSubtitleStyle}>Warmer cells = more tool calls.</p>
      <Heatmap cells={heatmap} />
    </Section>
  )
}

function MomentsSection({ moments }: { moments: Report["moments"] }) {
  const hasAny = moments.longestSession || moments.busiestDay || moments.mainCharacterFile
  if (!hasAny) return null
  return (
    <Section style={sectionStyle}>
      <EmailHeading variant="sectionTitle">Moments</EmailHeading>
      <p style={sectionSubtitleStyle}>Three highlights from the week.</p>
      <table
        cellPadding={0}
        cellSpacing={8}
        border={0}
        role="presentation"
        style={{ width: "100%", borderCollapse: "separate" }}
      >
        <tbody>
          <tr>
            {moments.longestSession ? (
              <MomentCard
                label="Longest session"
                value={formatDuration(moments.longestSession.durationMs)}
                detail={moments.longestSession.workspace}
              />
            ) : (
              <MomentCard label="Longest session" value="—" />
            )}
            {moments.busiestDay ? (
              <MomentCard
                label="Busiest day"
                value={formatBusiestDay(moments.busiestDay.date)}
                detail={`${formatCompact(moments.busiestDay.toolCalls)} tool calls`}
              />
            ) : (
              <MomentCard label="Busiest day" value="—" />
            )}
            {moments.mainCharacterFile ? (
              <MomentCard
                label="Main character"
                value={moments.mainCharacterFile.displayName}
                detail={`Touched ${formatCompact(moments.mainCharacterFile.touches)} time${
                  moments.mainCharacterFile.touches === 1 ? "" : "s"
                }`}
              />
            ) : (
              <MomentCard label="Main character" value="—" />
            )}
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

function PersonalityRevealSection({
  personality,
  imageBaseUrl,
}: {
  personality: Report["personality"]
  imageBaseUrl: string
}) {
  // Defensively narrow the evidence tuple — the schema guarantees 3 strings.
  const [e1 = "", e2 = "", e3 = ""] = personality.evidence
  return (
    <Section style={sectionStyle}>
      <PersonalityCard
        kind={personality.kind as PersonalityKindLocal}
        evidence={[e1, e2, e3]}
        imageBaseUrl={imageBaseUrl}
      />
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Root template
// ─────────────────────────────────────────────────────────────────────────

export function ClaudeCodeWrappedEmail({ userName, report, imageBaseUrl }: ClaudeCodeWrappedEmailProps) {
  return (
    <WrappedLayout previewText={`${userName}, your Claude Code week in ${report.project.name}`}>
      <HeroSection userName={userName} report={report} />
      <HeadlineNumbersGrid totals={report.totals} />
      <BreadthStrip totals={report.totals} />
      <ToolMixSection mix={report.toolMix} />
      <TopFilesSection files={report.topFiles} />
      <TopBashCommandsSection commands={report.topBashCommands} />
      <WorkspacesSection deepDives={report.workspaceDeepDives} otherCount={report.otherWorkspaceCount} />
      <HeatmapSection heatmap={report.heatmap} />
      <MomentsSection moments={report.moments} />
      <PersonalityRevealSection personality={report.personality} imageBaseUrl={imageBaseUrl} />
    </WrappedLayout>
  )
}

// React Email's preview server picks this up as the default story for the
// template. Keep it representative — a single-workspace user with
// strategist-friendly tool mix.
ClaudeCodeWrappedEmail.PreviewProps = {
  userName: "Alex",
  imageBaseUrl: "https://console.latitude.so/email-branding/claude-code-wrapped/personalities",
  report: {
    project: { id: ProjectId("proj-preview"), name: "poncho-ios", slug: "poncho-ios" },
    organization: { id: OrganizationId("org-preview"), name: "Acme" },
    window: {
      start: new Date("2026-05-04T00:00:00.000Z"),
      end: new Date("2026-05-11T00:00:00.000Z"),
    },
    totals: {
      sessions: 17,
      toolCalls: 482,
      durationMs: 5 * 60 * 60 * 1000,
      filesTouched: 142,
      commandsRun: 87,
      workspaces: 1,
      branches: 4,
      commits: 23,
      repos: 1,
    },
    toolMix: { bash: 87, read: 168, edit: 142, write: 21, search: 52, plan: 12, other: 0 },
    topFiles: [
      { path: "/Users/cesar/Dev/poncho-ios/src/index.ts", displayName: "index.ts", touches: 34 },
      { path: "/Users/cesar/Dev/poncho-ios/src/Chat.tsx", displayName: "Chat.tsx", touches: 21 },
      { path: "/Users/cesar/Dev/poncho-ios/src/types.ts", displayName: "types.ts", touches: 14 },
      { path: "/Users/cesar/Dev/poncho-ios/Package.swift", displayName: "Package.swift", touches: 9 },
      { path: "/Users/cesar/Dev/poncho-ios/README.md", displayName: "README.md", touches: 6 },
    ],
    topBashCommands: [
      { pattern: "pnpm", count: 32 },
      { pattern: "git", count: 21 },
      { pattern: "swift", count: 14 },
      { pattern: "ls", count: 11 },
      { pattern: "cat", count: 9 },
    ],
    topWorkspaces: [{ name: "poncho-ios", sessions: 17, toolCalls: 482 }],
    topBranches: [
      { name: "main", sessions: 9 },
      { name: "feat/chat-input", sessions: 5 },
    ],
    workspaceDeepDives: [
      {
        name: "poncho-ios",
        toolCalls: 482,
        sessions: 17,
        topFiles: [
          { path: "/Users/cesar/Dev/poncho-ios/src/index.ts", displayName: "index.ts", touches: 0 },
          { path: "/Users/cesar/Dev/poncho-ios/src/Chat.tsx", displayName: "Chat.tsx", touches: 0 },
          { path: "/Users/cesar/Dev/poncho-ios/src/types.ts", displayName: "types.ts", touches: 0 },
        ],
        topBranches: ["main", "feat/chat-input"],
        dominantTool: "edit",
      },
    ],
    otherWorkspaceCount: 0,
    heatmap: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 18, 22, 8, 4, 6, 14, 21, 9, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 14, 9, 4, 2, 11, 18, 24, 12, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 26, 31, 12, 5, 14, 22, 18, 7, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 12, 18, 8, 2, 9, 16, 14, 5, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 11, 7, 3, 1, 4, 8, 12, 4, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    moments: {
      longestSession: { durationMs: 92 * 60 * 1000, workspace: "poncho-ios" },
      busiestDay: { date: "2026-05-06", toolCalls: 107 },
      mainCharacterFile: {
        path: "/Users/cesar/Dev/poncho-ios/src/index.ts",
        displayName: "index.ts",
        touches: 34,
      },
    },
    personality: {
      kind: "surgeon",
      score: 0.42,
      evidence: [
        "42% of your tool calls were Edits",
        "Touched 142 files this week",
        "21 new files written from scratch",
      ],
    },
  },
} satisfies ClaudeCodeWrappedEmailProps
