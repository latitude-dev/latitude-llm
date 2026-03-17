import { Text } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../tokens/design-system.js"

type EmailTextVariant = "heading" | "body" | "bodySmall"

interface EmailTextProps {
  readonly children: string
  readonly variant: EmailTextVariant
  readonly className?: string
}

const variantClasses: Record<EmailTextVariant, string> = {
  heading: emailDesignTokens.typography.heading,
  body: emailDesignTokens.typography.body,
  bodySmall: emailDesignTokens.typography.bodySmall,
}

export function EmailText({ children, variant, className }: EmailTextProps) {
  return (
    <Text className={`${variantClasses[variant]} text-foreground m-0${className ? ` ${className}` : ""}`}>
      {children}
    </Text>
  )
}
