import { Text } from "@repo/ui"
import type { ReactNode } from "react"

/**
 * A titled block of settings. Same anatomy as `ScopedSetting` without the "Set by"
 * control, for pages where every card belongs to one scope already.
 */
export function SettingsCard({
  title,
  description,
  actions,
  notice,
  footer,
  children,
}: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  /** Rendered above the controls — the place to explain a read-only or degraded card. */
  readonly notice?: ReactNode
  readonly footer?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="flex w-full flex-col rounded-lg bg-muted/30">
      <div className="flex w-full flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>{title}</Text.H5M>
          {description ? <Text.H6 color="foregroundMuted">{description}</Text.H6> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-row items-center gap-2">{actions}</div> : null}
      </div>

      {notice ? <div className="border-border border-t p-5">{notice}</div> : null}

      <div className="flex w-full flex-col border-border border-t p-5">{children}</div>

      {footer ? <div className="border-border border-t p-5">{footer}</div> : null}
    </div>
  )
}
