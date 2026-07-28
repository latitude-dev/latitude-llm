import type { RedactionEntity, RedactionIdentityHandling, RedactionMode } from "@domain/shared"
import { Checkbox, DotIndicator, Label, Select, Switch, Text } from "@repo/ui"
import type { ReactNode } from "react"
import {
  decodeEntities,
  encodeEntities,
  REDACTION_ENTITY_META,
  REDACTION_ENTITY_ORDER,
} from "../../../../../../domains/projects/redaction-entities.ts"

const IDENTITY_OPTIONS: { label: string; value: RedactionIdentityHandling }[] = [
  { label: "Keep user identifiers", value: "keep" },
  { label: "Replace with a stable pseudonym", value: "pseudonymize" },
]

export interface RedactionCardValue {
  readonly mode: RedactionMode
  /** Sorted, comma-joined so a flat draft overlay can compare it by value. */
  readonly entities: string
  readonly metadata: boolean
  readonly identities: RedactionIdentityHandling
}

export function RedactionCard({
  idPrefix,
  title,
  description,
  value,
  isDirty,
  disabled = false,
  notice,
  footer,
  onChange,
}: {
  readonly idPrefix: string
  readonly title: string
  readonly description: ReactNode
  readonly value: RedactionCardValue
  readonly isDirty: boolean
  readonly disabled?: boolean
  /** Rendered above the controls — the place to explain a read-only card. */
  readonly notice?: ReactNode
  readonly footer?: ReactNode
  readonly onChange: <K extends keyof RedactionCardValue>(key: K, next: RedactionCardValue[K]) => void
}) {
  const enabled = value.mode === "enforce"
  const selected = new Set(decodeEntities(value.entities))

  const toggleEntity = (entity: RedactionEntity, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(entity)
    else next.delete(entity)
    onChange("entities", encodeEntities(next))
  }

  return (
    <div className="flex w-full flex-col rounded-lg bg-muted/30">
      {notice ? <div className="border-border border-b p-5">{notice}</div> : null}
      <div className="flex w-full flex-row items-start justify-between gap-4 p-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-enabled`} className="flex flex-row items-center gap-2">
            {title}
            {isDirty ? <DotIndicator variant="primary" aria-label="Unsaved changes" /> : null}
          </Label>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </div>
        <Switch
          id={`${idPrefix}-enabled`}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => onChange("mode", checked ? "enforce" : "off")}
        />
      </div>

      {enabled ? (
        <div className="flex w-full flex-col gap-6 border-border border-t p-5">
          <div className="flex flex-col gap-4">
            <Text.H6M>What to look for</Text.H6M>
            {REDACTION_ENTITY_ORDER.map((entity) => {
              const meta = REDACTION_ENTITY_META[entity]
              const id = `${idPrefix}-entity-${entity}`
              return (
                <div key={entity} className="flex flex-row items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={selected.has(entity)}
                    disabled={disabled}
                    onCheckedChange={(checked) => toggleEntity(entity, checked === true)}
                    aria-label={meta.label}
                  />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id}>{meta.label}</Label>
                    <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
                    {meta.caution ? <Text.H6 color="warningMutedForeground">{meta.caution}</Text.H6> : null}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-row items-start justify-between gap-4 border-border border-t pt-6">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-metadata`}>Also scan metadata and tags</Label>
              <Text.H6 color="foregroundMuted">
                Metadata is usually operational, and scanning it can remove values you filter and group by.
              </Text.H6>
            </div>
            <Switch
              id={`${idPrefix}-metadata`}
              checked={value.metadata}
              disabled={disabled}
              onCheckedChange={(checked) => onChange("metadata", checked)}
            />
          </div>

          <div className="flex flex-col gap-2 border-border border-t pt-6">
            <Select
              name={`${idPrefix}-identities`}
              label="User identifiers"
              options={IDENTITY_OPTIONS}
              value={value.identities}
              disabled={disabled}
              onChange={(next) => onChange("identities", next)}
            />
            <Text.H6 color="foregroundMuted">
              A pseudonym is stable, so filtering and grouping by user keep working. Self-hosted deployments without a
              pseudonym secret configured remove the identifier entirely instead.
            </Text.H6>
          </div>
        </div>
      ) : null}

      {footer ? <div className="border-border border-t p-5">{footer}</div> : null}
    </div>
  )
}
