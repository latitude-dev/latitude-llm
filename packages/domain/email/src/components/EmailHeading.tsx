// biome-ignore lint/style/useImportType: React is required at runtime for JSX in workers (tsx/esbuild classic transform). Do not downgrade to `import type`.
import React from "react"
import { emailDesignTokens } from "../tokens/design-system.ts"

type EmailHeadingVariant = "display" | "sectionTitle" | "cardTitle"

interface EmailHeadingProps {
  readonly children: string
  readonly variant: EmailHeadingVariant
  readonly className?: string
  /** Optional override for the foreground color (e.g. white on the accent card). */
  readonly color?: string
}

/**
 * Serif heading for the Claude Code Wrapped template. Uses Georgia as the
 * top of the serif stack so the visual lands in every major mail client
 * without an @font-face round-trip (Gmail strips most of those).
 *
 * Variants map to roughly:
 *   - display:      36-40px, the once-per-email hero line
 *   - sectionTitle: 22-24px, per-slide section header
 *   - cardTitle:    16-18px, sub-section / card header
 */
export function EmailHeading({ children, variant, className, color }: EmailHeadingProps) {
  const styleByVariant: Record<EmailHeadingVariant, { fontSize: string; lineHeight: string; fontWeight: number }> = {
    display: { fontSize: "36px", lineHeight: "42px", fontWeight: 500 },
    sectionTitle: { fontSize: "22px", lineHeight: "30px", fontWeight: 500 },
    cardTitle: { fontSize: "16px", lineHeight: "22px", fontWeight: 600 },
  }
  const v = styleByVariant[variant]
  const style: React.CSSProperties = {
    fontFamily: emailDesignTokens.fonts.serif,
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    fontWeight: v.fontWeight,
    color: color ?? emailDesignTokens.colors.claude.ink,
    margin: 0,
  }
  return (
    <p className={className} style={style}>
      {children}
    </p>
  )
}
