import { Icon } from "@repo/ui"
import { ExternalLinkIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Low-visual-weight strip at the bottom of every detail dashboard.
 *
 * Holds the "boring but sometimes-needed" metadata that doesn't merit
 * its own panel: ids, slugs, raw timestamps, Stripe customer ids,
 * settings JSON. Rendered in muted text so it informs without
 * competing for attention.
 *
 * The shape is "label key · value" pairs separated by a soft middle-
 * dot. Wraps freely. Each pair can be plain text (a string value) or a
 * custom node (e.g. for the Stripe deeplink, where the value is a
 * `<StripeCustomerLink>` with an external-link icon).
 */
export interface PropertiesStripProps {
  readonly entries: ReadonlyArray<PropertiesStripEntry>
}

export interface PropertiesStripEntry {
  readonly label: string
  readonly value: ReactNode
}

export function PropertiesStrip({ entries }: PropertiesStripProps) {
  if (entries.length === 0) return null

  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
      {entries.map((entry, idx) => (
        <span key={`${entry.label}:${idx}`} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground/70">{entry.label}</span>
          {typeof entry.value === "string" ? <span className="font-mono">{entry.value}</span> : entry.value}
          {idx < entries.length - 1 && <span aria-hidden="true" className="ml-1">·</span>}
        </span>
      ))}
    </footer>
  )
}

/**
 * Stripe customer deep-link affordance. Renders the customer id as a
 * monospace pill with a small external-link icon, opening the Stripe
 * dashboard in a new tab. Used inside `PropertiesStrip` for the
 * `stripeCustomerId` entries on user / organisation detail.
 *
 * Always opens in a new tab — staff context-switch between the app
 * and Stripe constantly during support, so an in-tab nav would be
 * destructive.
 */
export function StripeCustomerLink({ customerId }: { customerId: string }) {
  return (
    <a
      href={`https://dashboard.stripe.com/customers/${customerId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
    >
      {customerId}
      <Icon icon={ExternalLinkIcon} size="xs" color="foregroundMuted" />
      <span className="sr-only">Open in Stripe dashboard</span>
    </a>
  )
}
