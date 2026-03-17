import { Link } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../tokens/design-system.js"

interface EmailButtonProps {
  readonly href: string
  readonly label: string
}

export function EmailButton({ href, label }: EmailButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-block text-center no-underline ${emailDesignTokens.radius.button} bg-primary-dark-1 p-[1px] pb-[3px]`}
      style={{
        fontFamily: emailDesignTokens.fontFamily,
      }}
    >
      <span
        className={`inline-block ${emailDesignTokens.typography.button} ${emailDesignTokens.radius.button} border border-transparent bg-primary text-white py-[4px] px-3 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.35)]`}
      >
        {label}
      </span>
    </Link>
  )
}
