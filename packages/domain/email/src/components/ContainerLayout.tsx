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

const LATITUDE_LOGO_URL = "https://app.latitude.so/latitude-logo.png"

const tailwindConfig = {
  theme: {
    extend: {
      lineHeight: {
        h1: "48px",
      },
      colors: {
        border: "#E5E5E5",
        foreground: "#030712",
        muted: {
          foreground: "#545E69",
        },
        primary: {
          DEFAULT: "#076BD5",
          "dark-1": "#0657AE",
          "dark-2": "#054387",
        },
        accent: {
          DEFAULT: "#EFF7FF",
        },
        secondary: {
          DEFAULT: "#F9FAFB",
        },
      },
    },
  },
}

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
      <Tailwind config={tailwindConfig}>
        <Body className="bg-secondary m-0">
          <Container className="py-6 px-2">
            <Section className="pb-8">
              <Row>
                <Column align="left">
                  <Link href="https://app.latitude.so" className="text-center">
                    <Img src={LATITUDE_LOGO_URL} alt="Latitude's Logo" width="132" height="24" />
                  </Link>
                </Column>
                <Column align="right">
                  <Link
                    href="https://app.latitude.so"
                    className="inline-block text-center font-medium rounded-lg no-underline text-sm leading-5 bg-white text-foreground border border-border py-[5px] px-3"
                  >
                    Open Latitude
                  </Link>
                </Column>
              </Row>
            </Section>
            <Section className="bg-white rounded-2xl px-6 py-8 border border-border">
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
              <Link href="https://latitude.so">
                <span className="text-sm text-primary text-center">latitude.so</span>
              </Link>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
