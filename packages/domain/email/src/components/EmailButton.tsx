import { Link } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailButtonStyle } from "../tokens/design-system.js"

interface EmailButtonProps {
  readonly href: string
  readonly label: string
  readonly variant?: "default" | "outline"
}

export function EmailButton({ href, label, variant = "default" }: EmailButtonProps) {
  return (
    <Link href={href} style={emailButtonStyle(variant)}>
      {label}
    </Link>
  )
}
