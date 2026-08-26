import { cn } from "@repo/ui"
import type { ReactNode } from "react"

interface ScoreEntryCardProps {
  readonly dataAttributeName: string
  readonly id: string
  readonly children: ReactNode
  readonly className?: string | undefined
}

export function ScoreEntryCard({ dataAttributeName, id, children, className }: ScoreEntryCardProps) {
  return (
    <div
      {...{ [dataAttributeName]: id }}
      tabIndex={-1}
      className={cn(
        "m-1 flex flex-col gap-3 rounded-xl border border-border/80 bg-secondary/30 p-3 outline-none transition-colors",
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ScoreEntryCardHeaderProps {
  readonly meta: ReactNode
  readonly title?: ReactNode
  readonly trailing?: ReactNode
  readonly supporting?: ReactNode
}

export function ScoreEntryCardHeader({ meta, title, trailing, supporting }: ScoreEntryCardHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">{meta}</div>
        {title ? <div className="flex flex-wrap items-center gap-2">{title}</div> : null}
        {supporting ? <div className="flex items-center gap-2">{supporting}</div> : null}
      </div>

      {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
    </div>
  )
}

export function ScoreEntryCardSection({ children }: { readonly children: ReactNode }) {
  return <div className="flex items-center gap-2 border-t border-border/70 pt-2.5">{children}</div>
}

export function ScoreEntryCardBody({ children }: { readonly children: ReactNode }) {
  return <div className="border-t border-border/70 pt-2.5">{children}</div>
}
