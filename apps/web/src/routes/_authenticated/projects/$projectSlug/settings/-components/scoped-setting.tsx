import { Badge, DotIndicator, Select, Text } from "@repo/ui"
import { LockIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Which layer decides a setting's value. Settings that exist at both layers
 * resolve project → organization, so `project` means an override is stored.
 */
export type SettingScope = "organization" | "project"

export const SCOPE_LABELS: Record<SettingScope, string> = {
  organization: "Organization",
  project: "This project",
}

const SCOPE_OPTIONS: { label: string; value: SettingScope }[] = [
  { label: SCOPE_LABELS.organization, value: "organization" },
  { label: SCOPE_LABELS.project, value: "project" },
]

export type ScopeControl =
  /** A setting that only ever lives at one layer — renders as a static chip. */
  | { readonly kind: "fixed"; readonly value: SettingScope }
  /** A dual-scoped setting — the selector is the override/reset action. */
  | {
      readonly kind: "selectable"
      readonly value: SettingScope
      readonly onChange: (next: SettingScope) => void
      readonly loading?: boolean
      readonly disabled?: boolean
      readonly locked?: boolean
    }

/**
 * Card chrome for one setting, carrying its scope attribution in the header.
 * Presentational: the page owns the value, the scope, and the mutations, and
 * renders its own controls as `children` (read-only when the scope is
 * `organization`).
 */
export function ScopedSetting({
  idPrefix,
  title,
  description,
  scope,
  isDirty = false,
  notice,
  footer,
  children,
}: {
  readonly idPrefix: string
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly scope: ScopeControl
  readonly isDirty?: boolean
  /** Rendered above the controls — the place to explain a read-only or locked card. */
  readonly notice?: ReactNode
  readonly footer?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="flex w-full flex-col rounded-lg bg-muted/30">
      <div className="flex w-full flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Text.H5M>{title}</Text.H5M>
            {isDirty ? <DotIndicator variant="primary" aria-label="Unsaved changes" /> : null}
          </div>
          {description ? <Text.H6 color="foregroundMuted">{description}</Text.H6> : null}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          <Text.H6 color="foregroundMuted">Set by</Text.H6>
          {scope.kind === "fixed" ? (
            <Badge variant="outlineMuted" size="normal">
              {SCOPE_LABELS[scope.value]}
            </Badge>
          ) : (
            <Select
              name={`${idPrefix}-scope`}
              options={SCOPE_OPTIONS}
              value={scope.value}
              size="small"
              width="auto"
              loading={scope.loading ?? false}
              disabled={scope.disabled === true || scope.locked === true}
              placeholderIcon={scope.locked ? <LockIcon className="h-3 w-3" /> : undefined}
              onChange={(next) => {
                if (next !== scope.value) scope.onChange(next)
              }}
            />
          )}
        </div>
      </div>

      {notice ? <div className="border-border border-t p-5">{notice}</div> : null}

      <div className="flex w-full flex-col border-border border-t p-5">{children}</div>

      {footer ? <div className="border-border border-t p-5">{footer}</div> : null}
    </div>
  )
}
