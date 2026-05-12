// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { EmailHeading } from "../../../components/EmailHeading.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface WorkspaceCardProps {
  readonly name: string
  readonly sessions: number
  readonly toolCalls: number
  readonly topFiles: ReadonlyArray<{ displayName: string }>
  readonly topBranches: readonly string[]
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

/**
 * One workspace's deep-dive subsection: name, headline stats, top-3 files,
 * top-2 branches, and the dominant tool bucket.
 */
export function WorkspaceCard({ name, sessions, toolCalls, topFiles, topBranches, dominantTool }: WorkspaceCardProps) {
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
        {`${toolCalls.toLocaleString("en-US")} tool calls · ${sessions.toLocaleString("en-US")} session${
          sessions === 1 ? "" : "s"
        } · mostly ${TOOL_LABEL[dominantTool] ?? "Other"}`}
      </div>

      {topFiles.length > 0 ? (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: emailDesignTokens.colors.claude.mutedInk,
              marginBottom: "4px",
            }}
          >
            Top files
          </div>
          <div
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "13px",
              color: emailDesignTokens.colors.claude.ink,
            }}
          >
            {topFiles.map((f) => f.displayName).join(" · ")}
          </div>
        </div>
      ) : null}

      {topBranches.length > 0 ? (
        <div>
          <div
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: emailDesignTokens.colors.claude.mutedInk,
              marginBottom: "4px",
            }}
          >
            Branches
          </div>
          <div
            style={{
              fontFamily: emailDesignTokens.fonts.serif,
              fontSize: "13px",
              color: emailDesignTokens.colors.claude.ink,
            }}
          >
            {topBranches.join(" · ")}
          </div>
        </div>
      ) : null}
    </div>
  )
}
