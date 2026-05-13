import { Body, Container, Head, Html, Preview, Section, Tailwind } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React, { type ReactNode } from "react"
import { emailDesignTokens, emailTailwindConfig } from "../tokens/design-system.ts"

interface WrappedLayoutProps {
  readonly children: ReactNode
  readonly previewText: string
  /**
   * Required. Owns the footer copy / branding because those vary by template
   * (project deep-link, unsubscribe target, logo URL — all live with the
   * caller's data).
   */
  readonly footer: ReactNode
}

/**
 * Container for the Claude Code Wrapped email. A sibling to
 * `ContainerLayout` — not a replacement — because the existing layout's
 * Latitude-blue header would clash with the cream / orange Wrapped style.
 *
 * Visual model:
 *   - Page (Body) background: claude.cream (#F0EEE6).
 *   - Single full-width column inside a 600px Container so Outlook respects
 *     the line length without us hand-rolling MSO tables.
 *   - Top wordmark: "Claude Code Wrapped" in serif, very small, centered.
 *   - Sections are rendered as children — they own their own dividers and
 *     spacing so the layout stays minimal.
 *   - Footer: muted serif paragraph with the standard Latitude attribution
 *     plus the "Sent because…" opt-out hint.
 */
export function WrappedLayout({ children, previewText, footer }: WrappedLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind config={emailTailwindConfig}>
        <Body
          className="bg-claude-cream m-0"
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            color: emailDesignTokens.colors.claude.ink,
          }}
        >
          <Container className="py-8 px-4 max-w-[600px]">
            <Section className="pb-2 text-center">
              <span
                style={{
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "11px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: emailDesignTokens.colors.claude.mutedInk,
                }}
              >
                Claude Code Wrapped
              </span>
            </Section>

            {children}

            <Section className="mt-12 pt-6 border-t border-claude-cream-deep" align="center">
              {footer}
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
