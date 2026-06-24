import { cn, type FontSize, type FontWeight, Text, TextAtom } from "@repo/ui"
import type { ReactNode } from "react"

const TEXT_BY_SIZE = {
  h1: Text.H1,
  h2: Text.H2,
  h3: Text.H3,
  h4: Text.H4,
  h5: Text.H5,
  h6: Text.H6,
  h7: Text.H7,
} as const

const TABLE_GRID = "grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)]"

export function TypeSample({
  size,
  weight = "semibold",
  children,
  className,
}: {
  size: FontSize
  weight?: FontWeight
  children: ReactNode
  className?: string
}) {
  if (size === "h8") {
    return (
      <TextAtom size="h8" display="block" weight={weight} className={cn("min-w-0", className)}>
        {children}
      </TextAtom>
    )
  }

  const Comp = TEXT_BY_SIZE[size]
  return (
    <Comp display="block" weight={weight} className={cn("min-w-0", className)}>
      {children}
    </Comp>
  )
}

function TokenCell({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit rounded-md border border-border/60 bg-muted/40 px-2.5 py-1">
      <Text.Mono size="h7" color="foregroundMuted" display="block">
        {children}
      </Text.Mono>
    </span>
  )
}

export function TypographySection({
  title,
  description,
  children,
  footnote,
}: {
  title: string
  description?: string
  children: ReactNode
  footnote?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-8 border-t border-border pt-12 pb-12 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-2">
        <Text.H3 display="block" weight="semibold" color="foreground">
          {title}
        </Text.H3>
        {description ? (
          <Text.H5 color="foregroundMuted" display="block" weight="normal">
            {description}
          </Text.H5>
        ) : null}
      </div>
      {children}
      {footnote ? (
        <Text.H6 color="foregroundMuted" display="block">
          {footnote}
        </Text.H6>
      ) : null}
    </section>
  )
}

export function TypographyTable({
  columns,
  children,
}: {
  columns: { label: string; kind?: "demo" | "token" | "meta" }[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-hidden rounded-xl border border-border/70">
        <div className={cn("grid gap-x-6 border-b border-border bg-muted/25 px-5 py-4", TABLE_GRID)}>
          {columns.map((column) => (
            <Text.H6
              key={column.label}
              color="foregroundMuted"
              weight="semibold"
              uppercase
              className={cn("tracking-wide", column.kind === "token" && "font-mono normal-case tracking-normal")}
            >
              {column.label}
            </Text.H6>
          ))}
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

export function TypographyRow({
  example,
  token,
  meta,
  metaAsToken = false,
}: {
  example: ReactNode
  token: string
  meta?: ReactNode
  metaAsToken?: boolean
}) {
  return (
    <div className={cn("grid items-center gap-x-6 border-b border-border px-5 py-7 last:border-b-0", TABLE_GRID)}>
      <div className="min-w-0 text-foreground">{example}</div>
      <TokenCell>{token}</TokenCell>
      {metaAsToken ? (
        <TokenCell>{meta}</TokenCell>
      ) : (
        <Text.H6 color="foregroundMuted" display="block" weight="normal">
          {meta ?? "—"}
        </Text.H6>
      )}
    </div>
  )
}
