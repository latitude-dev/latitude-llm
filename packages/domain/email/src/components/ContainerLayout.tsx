import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
} from "@react-email/components"
import type { ReactNode } from "react"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens, emailTailwindConfig } from "../tokens/design-system.js"
import { EmailButton } from "./EmailButton.tsx"

const LATITUDE_LOGO_URL = "https://console.latitude.so/latitude-logo.png"

interface ContainerLayoutProps {
  readonly children: ReactNode
  readonly title?: string
  readonly previewText: string
  readonly footer?: ReactNode
}

export function ContainerLayout({ children, title, previewText, footer }: ContainerLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind config={emailTailwindConfig}>
        <Body className="bg-secondary m-0" style={{ fontFamily: emailDesignTokens.fontFamily }}>
          <Container className="py-6 px-2">
            <Section className="pb-8">
              <Row>
                <Column align="left">
                  <Link href="https://console.latitude.so" className="text-center">
                    <Img src={LATITUDE_LOGO_URL} alt="Latitude's Logo" width="132" height="24" />
                  </Link>
                </Column>
                <Column align="right">
                  <EmailButton href="https://console.latitude.so" label="Open Latitude" variant="outline" />
                </Column>
              </Row>
            </Section>
            <Section className={`bg-white ${emailDesignTokens.radius.card} px-6 py-8 border border-border`}>
              {title && (
                <Section className="mb-4">
                  <h2 className="text-2xl font-semibold text-foreground m-0">{title}</h2>
                </Section>
              )}
              {children}
              {footer ? <Section className="pt-6 border-t border-dashed mt-8 border-border">{footer}</Section> : null}
            </Section>
            <Section className="mt-8" align="center">
              <div className="mb-1 text-center">
                <span className="text-sm font-medium text-foreground">Latitude Data S.L.</span>
              </div>
              <div className="mb-1 text-center">
                <span className="text-sm text-muted-foreground">The AI engineering platform for product teams.</span>
              </div>
              <div className="text-center">
                <Link href="https://latitude.so" style={{ textDecoration: "none" }}>
                  <span className="text-sm" style={{ color: emailDesignTokens.colors.primary }}>
                    latitude.so
                  </span>
                </Link>
              </div>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
