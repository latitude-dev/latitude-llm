import type { PersonalityKind } from "@domain/spans"
import { Img } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { EmailHeading } from "../../../../components/EmailHeading.tsx"
import { emailDesignTokens } from "../../../../tokens/design-system.ts"

interface PersonalityCardProps {
  readonly kind: PersonalityKind
  readonly evidence: readonly [string, string, string]
  readonly imageBaseUrl: string
}

// Title + descriptor copy lives next to the component so adding an archetype
// to `PERSONALITY_KINDS` in @domain/spans gives an exhaustiveness error here
// until the maps are filled in.
const TITLE_FOR_KIND: Record<PersonalityKind, string> = {
  surgeon: "The Surgeon",
  architect: "The Architect",
  detective: "The Detective",
  conductor: "The Conductor",
  strategist: "The Strategist",
  scholar: "The Scholar",
  consultant: "The Consultant",
  shipper: "The Shipper",
  tester: "The Tester",
}

const DESCRIPTOR_FOR_KIND: Record<PersonalityKind, string> = {
  surgeon: "You changed code with sub-line precision.",
  architect: "You started from a blank page more than most.",
  detective: "You read and searched before you wrote.",
  conductor: "You ran the orchestra from the terminal.",
  strategist: "You planned twice, coded once.",
  scholar: "You sent Claude to the library.",
  consultant: "You dropped in, asked, and moved on.",
  shipper: "You closed the loop, again and again.",
  tester: "You don't trust it until it's green.",
}

/**
 * Full-bleed personality reveal — the email's closing slide. Orange accent
 * background, white serif headline, the PNG hero illustration above the
 * descriptor, and three evidence bullets below.
 */
export function PersonalityCard({ kind, evidence, imageBaseUrl }: PersonalityCardProps) {
  const imageUrl = `${imageBaseUrl.replace(/\/$/, "")}/${kind}.png`
  return (
    <div
      style={{
        backgroundColor: emailDesignTokens.colors.claude.accent,
        color: emailDesignTokens.colors.claude.accentForegroundOnDark,
        padding: "32px 24px",
        borderRadius: "12px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.8)",
          marginBottom: "16px",
        }}
      >
        Your archetype
      </div>
      <Img
        src={imageUrl}
        alt={TITLE_FOR_KIND[kind]}
        width="160"
        height="160"
        style={{ margin: "0 auto 16px auto", display: "block" }}
      />
      <EmailHeading variant="display" color={emailDesignTokens.colors.claude.accentForegroundOnDark}>
        {TITLE_FOR_KIND[kind]}
      </EmailHeading>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "16px",
          lineHeight: "24px",
          color: "rgba(255,255,255,0.92)",
          margin: "8px auto 20px auto",
          maxWidth: "440px",
        }}
      >
        {DESCRIPTOR_FOR_KIND[kind]}
      </p>
      <table cellPadding={0} cellSpacing={0} border={0} role="presentation" style={{ margin: "0 auto" }}>
        <tbody>
          {evidence
            .filter((line) => line.trim().length > 0)
            .map((line, idx) => (
              <tr key={idx}>
                <td
                  style={{
                    fontFamily: emailDesignTokens.fonts.serif,
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "rgba(255,255,255,0.95)",
                    paddingBottom: "4px",
                  }}
                >
                  {line}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
