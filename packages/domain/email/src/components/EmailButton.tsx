import { Link } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailButtonStyle, emailDesignTokens } from "../tokens/design-system.js"

interface EmailButtonProps {
  readonly href: string
  readonly label: string
  readonly variant?: "default" | "outline"
}

export function EmailButton({ href, label, variant = "default" }: EmailButtonProps) {
  const buttonStyle = emailButtonStyle(variant)
  const isDefault = variant === "default"

  return (
    <Link
      href={href}
      className={`inline-block text-center no-underline ${emailDesignTokens.radius.button} ${isDefault ? "bg-primary-dark-1 p-[1px] pb-[3px]" : ""}`}
      style={{
        fontFamily: emailDesignTokens.fontFamily,
        color: isDefault ? emailDesignTokens.colors.primaryForeground : undefined,
      }}
    >
      <span
        className={`inline-block ${emailDesignTokens.typography.button} ${emailDesignTokens.radius.button} ${isDefault ? "border border-transparent" : ""}`}
        style={{
          ...buttonStyle,
          display: "inline-block",
        }}
      >
        {label}
      </span>
    </Link>
  )
}
