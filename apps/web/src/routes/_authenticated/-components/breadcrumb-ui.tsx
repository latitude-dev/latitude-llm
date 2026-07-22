import { cn, Text } from "@repo/ui"
import { type CreateLinkProps, Link } from "@tanstack/react-router"
import { ChevronsUpDown } from "lucide-react"
import type { ReactNode } from "react"

const linkClass = "inline-flex items-center min-w-0 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"

/**
 * Shared trigger style for the org and project switchers (both `Combobox`-based),
 * matching the org switcher's original design — the reference both were unified to:
 * same padding/radius/hover surface, same emoji sizing, same label color/weight,
 * and the same chevron glyph (passed as `ComboboxTrigger`'s `icon` override, since
 * its built-in default is a different single-chevron icon).
 */
export const breadcrumbSwitcherTriggerClassName =
  "flex min-w-0 max-w-48 items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"

export const breadcrumbSwitcherEmojiClassName = "text-base leading-none shrink-0"

export function BreadcrumbSwitcherChevron() {
  return <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
}

export type BreadcrumbLinkProps = Omit<CreateLinkProps, "children"> & {
  children: ReactNode
  className?: string
}

/**
 * TanStack `Link` styled for breadcrumb trails (muted label, hover surface).
 * Compose with {@link BreadcrumbSeparator} inside a segment; {@link BreadcrumbTrail} wraps each segment in a flex row.
 */
export function BreadcrumbLink({ className, children, ...props }: BreadcrumbLinkProps) {
  return (
    <Link {...props} className={cn(linkClass, className)}>
      <Text.H5M color="foregroundMuted" ellipsis>
        {children}
      </Text.H5M>
    </Link>
  )
}

export type BreadcrumbTextProps = {
  children: ReactNode
  className?: string
  /** `muted` — intermediary segments; `current` — final (non-link) segment */
  variant?: "muted" | "current"
}

/**
 * Non-link breadcrumb label. Use `current` for the leaf; `muted` for plain text in the middle of a branch.
 */
export function BreadcrumbText({ children, className, variant = "muted" }: BreadcrumbTextProps) {
  return (
    <Text.H5M
      color={variant === "current" ? "foreground" : "foregroundMuted"}
      ellipsis
      className={cn("px-2 py-1 min-w-0", className)}
    >
      {children}
    </Text.H5M>
  )
}

/** Slash between pieces inside one route segment (trail adds its own leading separator per segment). */
export function BreadcrumbSeparator() {
  return (
    <span className="text-muted-foreground text-sm select-none shrink-0" aria-hidden>
      /
    </span>
  )
}
