import { Section } from "@react-email/components"
// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { EmailHeading } from "../../../components/EmailHeading.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface WorkspaceFile {
  readonly displayPath: string
  readonly touches: number
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly reads: number
}

interface WorkspaceBashCommand {
  readonly pattern: string
  readonly count: number
}

interface WorkspaceSectionProps {
  readonly name: string
  readonly sessions: number
  readonly toolCalls: number
  readonly commits: number
  readonly topFiles: readonly WorkspaceFile[]
  readonly topBranches: readonly string[]
  readonly topBashCommands: readonly WorkspaceBashCommand[]
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

const subSectionLabelStyle: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: emailDesignTokens.colors.claude.mutedInk,
  margin: "0 0 8px 0",
}

const rowCellBase: React.CSSProperties = {
  fontFamily: emailDesignTokens.fonts.serif,
  fontSize: "14px",
  color: emailDesignTokens.colors.claude.ink,
  padding: "6px 0",
  verticalAlign: "middle",
}

const rowDividerStyle: React.CSSProperties = {
  borderBottom: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
}

const monoStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "13px",
}

const fileStat = (file: WorkspaceFile): React.ReactNode => {
  if (file.linesAdded > 0 || file.linesRemoved > 0) {
    return (
      <>
        <span style={{ color: emailDesignTokens.colors.claude.accent }}>{`+${formatCompact(file.linesAdded)}`}</span>
        <span style={{ color: emailDesignTokens.colors.claude.mutedInk }}>{" / "}</span>
        <span>{`−${formatCompact(file.linesRemoved)}`}</span>
      </>
    )
  }
  if (file.reads > 0) {
    return `${formatCompact(file.reads)} read${file.reads === 1 ? "" : "s"}`
  }
  return `${formatCompact(file.touches)} touch${file.touches === 1 ? "" : "es"}`
}

/**
 * Renders one workspace as a full-width section. Files / commands / branches
 * each get a vertical table with right-aligned stats so wrapping never bites.
 */
export function WorkspaceSection({
  name,
  sessions,
  toolCalls,
  commits,
  topFiles,
  topBranches,
  topBashCommands,
  dominantTool,
}: WorkspaceSectionProps) {
  const breadthParts: string[] = [
    `${formatCompact(toolCalls)} tool calls`,
    `${formatCompact(sessions)} session${sessions === 1 ? "" : "s"}`,
  ]
  if (commits > 0) breadthParts.push(`${formatCompact(commits)} commit${commits === 1 ? "" : "s"}`)
  breadthParts.push(`mostly ${TOOL_LABEL[dominantTool] ?? "Other"}`)

  return (
    <Section style={{ marginTop: "32px" }}>
      <EmailHeading variant="sectionTitle">{name}</EmailHeading>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "13px",
          color: emailDesignTokens.colors.claude.mutedInk,
          margin: "6px 0 18px 0",
        }}
      >
        {breadthParts.join(" · ")}
      </p>

      {topFiles.length > 0 ? (
        <div style={{ marginBottom: "16px" }}>
          <p style={subSectionLabelStyle}>Top files</p>
          <table
            cellPadding={0}
            cellSpacing={0}
            border={0}
            role="presentation"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <tbody>
              {topFiles.map((file, idx) => (
                // Include the index — two files can collapse to the same
                // displayPath (e.g. workspacePath unknown + matching basenames).
                <tr key={`${idx}-${file.displayPath}`} style={idx < topFiles.length - 1 ? rowDividerStyle : undefined}>
                  <td style={{ ...rowCellBase, ...monoStyle, wordBreak: "break-all" }}>{file.displayPath}</td>
                  <td
                    align="right"
                    style={{
                      ...rowCellBase,
                      whiteSpace: "nowrap",
                      paddingLeft: "16px",
                    }}
                  >
                    {fileStat(file)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {topBashCommands.length > 0 ? (
        <div style={{ marginBottom: "16px" }}>
          <p style={subSectionLabelStyle}>Top commands</p>
          <table
            cellPadding={0}
            cellSpacing={0}
            border={0}
            role="presentation"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <tbody>
              {topBashCommands.map((cmd, idx) => (
                <tr key={cmd.pattern} style={idx < topBashCommands.length - 1 ? rowDividerStyle : undefined}>
                  <td style={{ ...rowCellBase, ...monoStyle }}>{cmd.pattern}</td>
                  <td
                    align="right"
                    style={{
                      ...rowCellBase,
                      color: emailDesignTokens.colors.claude.mutedInk,
                      whiteSpace: "nowrap",
                      paddingLeft: "16px",
                    }}
                  >
                    {`${formatCompact(cmd.count)} run${cmd.count === 1 ? "" : "s"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {topBranches.length > 0 ? (
        <div>
          <p style={subSectionLabelStyle}>Active branches</p>
          <p
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "14px",
              color: emailDesignTokens.colors.claude.ink,
              margin: 0,
            }}
          >
            {topBranches.join(" · ")}
          </p>
        </div>
      ) : null}
    </Section>
  )
}
