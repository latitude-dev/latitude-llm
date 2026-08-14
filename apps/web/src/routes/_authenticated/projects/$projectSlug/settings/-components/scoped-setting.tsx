import { Badge, Button, DotIndicator, Modal, Select, Text } from "@repo/ui"
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

/** Confirms the destructive direction of the selector — dropping this project's own values. */
export interface PendingScopeChange {
  readonly title: string
  readonly description: ReactNode
  readonly applyLabel: string
  readonly isApplying: boolean
  readonly onApply: () => void
  readonly onDiscard: () => void
}

export function ScopedSetting({
  idPrefix,
  title,
  description,
  scope,
  isDirty = false,
  pendingChange,
  notice,
  footer,
  children,
}: {
  readonly idPrefix: string
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly scope: ScopeControl
  readonly isDirty?: boolean
  readonly pendingChange?: PendingScopeChange | undefined
  /** Rendered above the controls — the place to explain a read-only or locked card. */
  readonly notice?: ReactNode
  readonly footer?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <>
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
            {scope.kind === "selectable" && scope.locked ? (
              <LockIcon className="h-3 w-3 text-muted-foreground" aria-label="Locked by the organization" />
            ) : null}
            {scope.kind === "fixed" ? (
              <Badge variant="outlineMuted" size="normal">
                {SCOPE_LABELS[scope.value]}
              </Badge>
            ) : (
              <Select
                name={`${idPrefix}-scope`}
                aria-label="Set by"
                options={SCOPE_OPTIONS}
                value={scope.value}
                size="small"
                width="auto"
                loading={scope.loading ?? false}
                disabled={scope.disabled === true || scope.locked === true}
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

      {pendingChange ? (
        <Modal
          open
          dismissible
          onOpenChange={(next) => {
            if (!next && !pendingChange.isApplying) pendingChange.onDiscard()
          }}
          title={pendingChange.title}
          description={pendingChange.description}
          footer={
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={pendingChange.onDiscard} disabled={pendingChange.isApplying}>
                Cancel
              </Button>
              <Button onClick={pendingChange.onApply} disabled={pendingChange.isApplying}>
                {pendingChange.applyLabel}
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}
