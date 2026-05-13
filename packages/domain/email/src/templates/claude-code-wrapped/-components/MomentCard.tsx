// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface MomentCardProps {
  readonly label: string
  readonly value: string
  readonly detail?: string | null
}

/**
 * Single "moment" tile — used three-across for longest session / busiest day /
 * main-character file. Cell width is controlled by the parent table; the
 * card itself just paints its own background and frame.
 */
export function MomentCard({ label, value, detail }: MomentCardProps) {
  return (
    <td
      valign="top"
      style={{
        padding: "16px",
        backgroundColor: emailDesignTokens.colors.white,
        border: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
        borderRadius: "8px",
        width: "33.333%",
      }}
    >
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "11px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "18px",
          lineHeight: "24px",
          color: emailDesignTokens.colors.claude.ink,
          marginBottom: detail ? "4px" : 0,
        }}
      >
        {value}
      </div>
      {detail ? (
        <div
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "12px",
            color: emailDesignTokens.colors.claude.mutedInk,
          }}
        >
          {detail}
        </div>
      ) : null}
    </td>
  )
}
