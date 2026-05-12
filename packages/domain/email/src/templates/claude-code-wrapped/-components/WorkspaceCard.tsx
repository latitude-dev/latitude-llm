// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../../components/EmailHeading.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface WorkspaceCardProps {
  readonly name: string
  readonly sessions: number
  readonly toolCalls: number
  readonly commits: number
  readonly topFiles: ReadonlyArray<{ readonly displayPath: string }>
  readonly topBranches: readonly string[]
  readonly topBashCommand: { readonly pattern: string; readonly count: number } | null
  readonly dominantTool: string
}

const TOOL_LABEL: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  edit: "Edit",
  write: "Write",
  search: "Search",
  plan: "Plan",
  other: "Other",
}

const formatCompact = (n: number): string => n.toLocaleString("en-US")

const labelStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: emailDesignTokens.colors.claude.mutedInk,
  marginBottom: "4px",
}

const valueStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "13px",
  color: emailDesignTokens.colors.claude.ink,
}

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "12px",
  backgroundColor: emailDesignTokens.colors.claude.creamDeep,
  padding: "1px 6px",
  borderRadius: "3px",
}

/**
 * One workspace's deep-dive subsection. File paths are relative to the
 * workspace root (computed at build time from `metadata['workspace.path']`)
 * — never absolute. Top bash command and commits are also surfaced here
 * because they're more interesting in workspace context than globally.
 */
export function WorkspaceCard({
  name,
  sessions,
  toolCalls,
  commits,
  topFiles,
  topBranches,
  topBashCommand,
  dominantTool,
}: WorkspaceCardProps) {
  const breadthParts: string[] = [
    `${formatCompact(toolCalls)} tool calls`,
    `${formatCompact(sessions)} session${sessions === 1 ? "" : "s"}`,
  ]
  if (commits > 0) breadthParts.push(`${formatCompact(commits)} commit${commits === 1 ? "" : "s"}`)
  breadthParts.push(`mostly ${TOOL_LABEL[dominantTool] ?? "Other"}`)

  return (
    <div
      style={{
        padding: "16px 18px",
        backgroundColor: emailDesignTokens.colors.white,
        border: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
        borderRadius: "8px",
        marginBottom: "12px",
      }}
    >
      <EmailHeading variant="cardTitle">{name}</EmailHeading>
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "12px",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginTop: "4px",
          marginBottom: "12px",
        }}
      >
        {breadthParts.join(" · ")}
      </div>

      {topFiles.length > 0 ? (
        <div style={{ marginBottom: "8px" }}>
          <div style={labelStyle}>Top files</div>
          <div style={valueStyle}>{topFiles.map((f) => f.displayPath).join(" · ")}</div>
        </div>
      ) : null}

      {topBranches.length > 0 ? (
        <div style={{ marginBottom: "8px" }}>
          <div style={labelStyle}>Branches</div>
          <div style={valueStyle}>{topBranches.join(" · ")}</div>
        </div>
      ) : null}

      {topBashCommand ? (
        <div>
          <div style={labelStyle}>Top command</div>
          <div style={valueStyle}>
            <span style={codeStyle}>{topBashCommand.pattern}</span>
            <span style={{ color: emailDesignTokens.colors.claude.mutedInk, marginLeft: "8px" }}>
              {`${formatCompact(topBashCommand.count)} run${topBashCommand.count === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
