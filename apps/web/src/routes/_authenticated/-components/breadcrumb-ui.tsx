import { cn, Text } from "@repo/ui"
import { type CreateLinkProps, Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

const linkClass = "inline-flex items-center min-w-0 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"

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
      <Text.H5M color="foregroundMuted" className="truncate">
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
