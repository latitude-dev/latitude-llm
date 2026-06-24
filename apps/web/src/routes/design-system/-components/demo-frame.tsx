import { cn } from "@repo/ui"
import type { ReactNode } from "react"
import { TypographySection } from "./typography-table.tsx"

export function DemoFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background p-4 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ComponentDemoSection({
  title,
  description,
  frameClassName,
  children,
}: {
  title: string
  description?: string | undefined
  frameClassName?: string | undefined
  children: ReactNode
}) {
  return (
    <TypographySection title={title} {...(description ? { description } : {})}>
      <DemoFrame {...(frameClassName ? { className: frameClassName } : {})}>{children}</DemoFrame>
    </TypographySection>
  )
}
