import { Text } from "@repo/ui"
import type { ReactNode } from "react"
import { useDesignSystemTheme } from "./design-system-theme.tsx"

export function DesignSystemPage({
  eyebrow: _eyebrow,
  title,
  description,
  actions,
  children,
  wide = false,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const { surfaceClass } = useDesignSystemTheme()

  return (
    <div className={`flex min-h-full flex-col gap-8 p-6 sm:p-8 lg:p-10 ${surfaceClass}`}>
      <header className={`flex max-w-4xl flex-col gap-4 ${wide ? "max-w-none" : ""}`}>
        <Text.H2 className="text-balance">{title}</Text.H2>
        {description ? <Text.H6 color="foregroundMuted">{description}</Text.H6> : null}
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </header>
      <div className={wide ? "flex flex-col" : "flex max-w-4xl flex-col gap-8"}>{children}</div>
    </div>
  )
}
