import { Text } from "@react-email/components"
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
