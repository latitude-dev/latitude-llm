import { OrganizationId, ProjectId } from "@domain/shared"
import type { Report } from "@domain/spans"
import { Img, Link, Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../components/EmailHeading.tsx"
import { WrappedLayout } from "../../components/WrappedLayout.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"
import { Heatmap } from "./-components/Heatmap.tsx"
import { MomentCard } from "./-components/MomentCard.tsx"
import { PersonalityCard, type PersonalityKindLocal } from "./-components/PersonalityCard.tsx"
import { StatCard } from "./-components/StatCard.tsx"
import { WorkspaceSection } from "./-components/WorkspaceSection.tsx"

interface ClaudeCodeWrappedEmailProps {
  readonly userName: string
  readonly report: Report
  /**
   * Public base URL of the web app (no trailing slash). The template derives
   * personality PNG URLs, the project deep-link, the unsubscribe link, and
   * the Latitude logo from it. Worker passes `LAT_WEB_URL`.
   */
  readonly webAppUrl: string
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

// ─────────────────────────────────────────────────────────────────────────
// Section styles
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

const bigNumberStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "44px",
  lineHeight: "52px",
  fontWeight: 500,
  color: emailDesignTokens.colors.claude.ink,
  margin: "8px 0 4px 0",
}

const anchorStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "14px",
  fontStyle: "italic",
  color: emailDesignTokens.colors.claude.mutedInk,
  margin: 0,
}

// ─────────────────────────────────────────────────────────────────────────
// Sections (top to bottom in display order)
// ─────────────────────────────────────────────────────────────────────────

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
  const breadthParts: string[] = []
  if (totals.workspaces > 0) breadthParts.push(`${formatCompact(totals.workspaces)} workspaces`)
  if (totals.branches > 0) breadthParts.push(`${formatCompact(totals.branches)} branches`)
  if (totals.commits > 0) breadthParts.push(`${formatCompact(totals.commits)} commits`)
  if (totals.repos > 0) breadthParts.push(`${formatCompact(totals.repos)} repos`)

  const subParts: string[] = []
  if (totals.streakDays > 0) {
    subParts.push(`${totals.streakDays}-day streak`)
  }
  if (totals.testsRun > 0) {
    subParts.push(`${formatCompact(totals.testsRun)} test run${totals.testsRun === 1 ? "" : "s"}`)
  }

  if (breadthParts.length === 0 && subParts.length === 0) return null

  return (
    <Section style={{ marginTop: "12px", textAlign: "center" }}>
      {breadthParts.length > 0 ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "13px",
            color: emailDesignTokens.colors.claude.mutedInk,
            margin: 0,
          }}
        >
          {breadthParts.join(" · ")}
        </p>
      ) : null}
      {subParts.length > 0 ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "13px",
            color: emailDesignTokens.colors.claude.accent,
            margin: "4px 0 0 0",
          }}
        >
          {subParts.join(" · ")}
        </p>
      ) : null}
    </Section>
  )
}

function LocSection({ loc }: { loc: Report["loc"] }) {
  if (loc.written <= 0 && loc.read <= 0) return null

  return (
    <Section style={{ ...sectionStyle, textAlign: "center" }}>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "13px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: emailDesignTokens.colors.claude.mutedInk,
          margin: 0,
        }}
      >
        Lines written
      </p>
      <p style={bigNumberStyle}>{formatCompact(loc.written)}</p>
      {loc.writtenAnchor ? <p style={anchorStyle}>{loc.writtenAnchor}</p> : null}
      {loc.added > 0 || loc.removed > 0 ? (
        <p
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "13px",
            color: emailDesignTokens.colors.claude.mutedInk,
            margin: "12px 0 0 0",
          }}
        >
          <span style={{ color: emailDesignTokens.colors.claude.accent }}>{`+${formatCompact(loc.added)}`}</span>
          {" / "}
          <span>{`−${formatCompact(loc.removed)}`}</span>
          {" across edits"}
        </p>
      ) : null}
    </Section>
  )
}

function ReadWriteRatioSection({ loc }: { loc: Report["loc"] }) {
  if (loc.written <= 0 || loc.read <= 0) return null
  const ratio = loc.read / loc.written
  // Round to integer when the ratio is meaningfully whole; otherwise 1dp.
  const ratioText = ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1)
  return (
    <Section style={{ ...sectionStyle, textAlign: "center" }}>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "18px",
          lineHeight: "26px",
          color: emailDesignTokens.colors.claude.ink,
          margin: 0,
          maxWidth: "440px",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {`For every line you wrote, Claude read `}
        <span style={{ color: emailDesignTokens.colors.claude.accent, fontWeight: 600 }}>{ratioText}</span>
        {`.`}
      </p>
      {loc.readAnchor ? (
        <p style={{ ...anchorStyle, marginTop: "8px" }}>
          {`${formatCompact(loc.read)} lines read — ${loc.readAnchor}`}
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
  const hasAny = moments.longestSession || moments.busiestDay || moments.biggestWrite
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
            {moments.biggestWrite ? (
              <MomentCard
                label="Biggest single write"
                value={moments.biggestWrite.displayName}
                detail={`${formatCompact(moments.biggestWrite.lines)} line${moments.biggestWrite.lines === 1 ? "" : "s"}`}
              />
            ) : (
              <MomentCard label="Biggest single write" value="—" />
            )}
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

function TopCommandLine({ command }: { command: Report["topBashCommand"] }) {
  if (!command) return null
  return (
    <Section style={{ ...sectionStyle, textAlign: "center" }}>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "18px",
          lineHeight: "26px",
          color: emailDesignTokens.colors.claude.ink,
          margin: 0,
        }}
      >
        {`Your favorite command: `}
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            backgroundColor: emailDesignTokens.colors.claude.creamDeep,
            padding: "2px 8px",
            borderRadius: "4px",
            color: emailDesignTokens.colors.claude.accent,
          }}
        >
          {command.pattern}
        </span>
        {` — ${formatCompact(command.count)} run${command.count === 1 ? "" : "s"}.`}
      </p>
    </Section>
  )
}

function WorkspaceSections({ deepDives, otherCount }: { deepDives: Report["workspaceDeepDives"]; otherCount: number }) {
  if (deepDives.length === 0) return null
  // Each workspace renders as its own section — no parent wrapper. With only
  // one workspace, the section reads as the user's whole story this week;
  // with several, each gets equal narrative weight instead of cramming into
  // a card.
  return (
    <>
      {deepDives.map((ws) => (
        <WorkspaceSection
          key={ws.name}
          name={ws.name}
          sessions={ws.sessions}
          toolCalls={ws.toolCalls}
          commits={ws.commits}
          topFiles={ws.topFiles}
          topBranches={ws.topBranches}
          topBashCommands={ws.topBashCommands}
          dominantTool={ws.dominantTool}
        />
      ))}
      {otherCount > 0 ? (
        <Section style={{ marginTop: "8px" }}>
          <p
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "12px",
              color: emailDesignTokens.colors.claude.mutedInk,
              margin: 0,
            }}
          >
            {`You also touched ${otherCount} other workspace${otherCount === 1 ? "" : "s"}.`}
          </p>
        </Section>
      ) : null}
    </>
  )
}

function PersonalityRevealSection({
  personality,
  imageBaseUrl,
}: {
  personality: Report["personality"]
  imageBaseUrl: string
}) {
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
// Footer
// ─────────────────────────────────────────────────────────────────────────

const footerLineStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "12px",
  lineHeight: "18px",
  color: emailDesignTokens.colors.claude.mutedInk,
  margin: 0,
  textAlign: "center",
}

const footerLinkStyle: React.CSSProperties = {
  color: emailDesignTokens.colors.claude.accent,
  textDecoration: "underline",
}

function WrappedFooter({
  projectName,
  projectUrl,
  settingsUrl,
  logoUrl,
  homeUrl,
}: {
  projectName: string
  projectUrl: string
  settingsUrl: string
  logoUrl: string
  homeUrl: string
}) {
  return (
    <>
      <p style={footerLineStyle}>
        {"Sent because you are tracking "}
        <Link href={projectUrl} style={footerLinkStyle}>
          {projectName}
        </Link>
        {"'s Claude Code activity with Latitude."}
      </p>
      <p style={{ ...footerLineStyle, marginTop: "4px" }}>
        <Link href={settingsUrl} style={{ ...footerLinkStyle, color: emailDesignTokens.colors.claude.mutedInk }}>
          Stop receiving these emails
        </Link>
      </p>
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <Link href={homeUrl}>
          <Img src={logoUrl} alt="Latitude" width="120" height="22" style={{ display: "inline-block" }} />
        </Link>
        <p style={{ ...footerLineStyle, marginTop: "8px" }}>Latitude — the AI observability platform.</p>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Root template
// ─────────────────────────────────────────────────────────────────────────

export function ClaudeCodeWrappedEmail({ userName, report, webAppUrl }: ClaudeCodeWrappedEmailProps) {
  const base = webAppUrl.replace(/\/$/, "")
  const imageBaseUrl = `${base}/email-branding/claude-code-wrapped/personalities`
  const projectUrl = `${base}/projects/${report.project.slug}`
  const settingsUrl = `${base}/settings/account`
  const logoUrl = `${base}/latitude-logo.png`

  return (
    <WrappedLayout
      previewText={`${userName}, your Claude Code week in ${report.project.name}`}
      footer={
        <WrappedFooter
          projectName={report.project.name}
          projectUrl={projectUrl}
          settingsUrl={settingsUrl}
          logoUrl={logoUrl}
          homeUrl={base}
        />
      }
    >
      <HeroSection userName={userName} report={report} />
      <HeadlineNumbersGrid totals={report.totals} />
      <BreadthStrip totals={report.totals} />
      <LocSection loc={report.loc} />
      <ReadWriteRatioSection loc={report.loc} />
      <HeatmapSection heatmap={report.heatmap} />
      <MomentsSection moments={report.moments} />
      <TopCommandLine command={report.topBashCommand} />
      <WorkspaceSections deepDives={report.workspaceDeepDives} otherCount={report.otherWorkspaceCount} />
      <PersonalityRevealSection personality={report.personality} imageBaseUrl={imageBaseUrl} />
    </WrappedLayout>
  )
}

ClaudeCodeWrappedEmail.PreviewProps = {
  userName: "Alex",
  webAppUrl: "http://localhost:3000",
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
      streakDays: 5,
      testsRun: 32,
    },
    toolMix: { bash: 87, read: 168, edit: 142, write: 21, search: 52, plan: 12, other: 0 },
    loc: {
      written: 14_832,
      read: 184_200,
      added: 9_421,
      removed: 3_402,
      writtenAnchor: "≈ 10% of the Apollo 11 guidance code",
      readAnchor: "≈ a full-length novel",
    },
    topBashCommand: { pattern: "pnpm", count: 32 },
    workspaceDeepDives: [
      {
        name: "poncho-ios",
        toolCalls: 482,
        sessions: 17,
        commits: 23,
        topFiles: [
          {
            displayPath: "Poncho/Sources/Root/RootView.swift",
            touches: 34,
            linesAdded: 234,
            linesRemoved: 132,
            reads: 7,
          },
          {
            displayPath: "Poncho/Sources/Sidebar/SidebarView.swift",
            touches: 21,
            linesAdded: 890,
            linesRemoved: 0,
            reads: 0,
          },
          { displayPath: "Project.swift", touches: 14, linesAdded: 0, linesRemoved: 0, reads: 14 },
        ],
        topBranches: ["main", "feat/chat-input", "fix/keyboard"],
        topBashCommands: [
          { pattern: "xcodebuild", count: 19 },
          { pattern: "swift", count: 14 },
          { pattern: "git", count: 11 },
        ],
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
      biggestWrite: { displayName: "Chat.tsx", lines: 890 },
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
