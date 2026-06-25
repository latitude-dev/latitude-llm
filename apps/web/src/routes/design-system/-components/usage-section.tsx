import { CodeBlock, CopyButton, Text } from "@repo/ui"
import type { ReactNode } from "react"
import { TypographySection } from "./typography-table.tsx"

export function UsageSection({ description, children }: { description?: string | undefined; children: ReactNode }) {
  return (
    <TypographySection title="Usage" {...(description ? { description } : {})}>
      {children}
    </TypographySection>
  )
}

export function UsageCode({
  lines,
  language = "tsx",
}: {
  lines: readonly string[]
  language?: string | undefined
}) {
  const value = lines.join("\n").replace(/\n+$/, "")

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/60 px-3 py-1.5">
        <Text.Mono size="h7" color="foregroundMuted">
          {language}
        </Text.Mono>
        <CopyButton value={value} tooltip="Copy code" />
      </div>
      <CodeBlock
        value={value}
        copyable={false}
        expandable={false}
        wrapLines={false}
        className="rounded-none border-0 bg-transparent [&_.cm-scroller]:max-h-80"
        {...(language ? { language } : {})}
      />
    </div>
  )
}
