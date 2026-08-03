import type { RedactionEntity, RedactionIdentityHandling, RedactionMode } from "@domain/shared"
import { Checkbox, Label, Switch, Text } from "@repo/ui"
import {
  decodeEntities,
  encodeEntities,
  REDACTION_ENTITY_META,
  REDACTION_ENTITY_ORDER,
} from "../../../../../../domains/projects/redaction-entities.ts"
import { RedactionIdentityChoice } from "./redaction-identity-choice.tsx"
import { RedactionRulesSection } from "./redaction-rules-section.tsx"

export interface RedactionCardValue {
  readonly mode: RedactionMode
  /** Sorted, comma-joined so a flat draft overlay can compare it by value. */
  readonly entities: string
  readonly metadata: boolean
  readonly identities: RedactionIdentityHandling
  /** Canonical JSON, for the same reason `entities` is a string. */
  readonly rules: string
}

/** Redaction controls only. Card chrome, title, and scope live in `ScopedSetting`. */
export function RedactionCard({
  idPrefix,
  value,
  disabled = false,
  onChange,
}: {
  readonly idPrefix: string
  readonly value: RedactionCardValue
  readonly disabled?: boolean
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
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-enabled`}>Redact personal data</Label>
          {/* At the switch rather than in the page intro: this is the moment the choice is made. */}
          <Text.H6 color="foregroundMuted">
            Applies to spans ingested from now on. Redacted content cannot be recovered.
          </Text.H6>
        </div>
        <Switch
          id={`${idPrefix}-enabled`}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => onChange("mode", checked ? "enforce" : "off")}
        />
      </div>

      {enabled ? (
        <>
          <div className="flex flex-col gap-5 border-border border-t pt-6">
            <div className="flex flex-col gap-1">
              <Text.H6M>What to redact</Text.H6M>
              {/* The expectation gap that matters: "redact personal data" reads as covering names. */}
              <Text.H6 color="foregroundMuted">
                Matching is by shape, so it catches structured identifiers reliably and does not catch names, addresses,
                or free-form personal detail.
              </Text.H6>
            </div>

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
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label htmlFor={id}>{meta.label}</Label>
                    <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
                    {meta.caution ? <Text.H6 color="warningMutedForeground">{meta.caution}</Text.H6> : null}
                  </div>
                </div>
              )
            })}

            <RedactionRulesSection
              idPrefix={idPrefix}
              value={value.rules}
              disabled={disabled}
              onChange={(next) => onChange("rules", next)}
            />
          </div>

          <div className="flex flex-col gap-4 border-border border-t pt-6">
            <div className="flex flex-col gap-1">
              <Text.H6M>Where to look</Text.H6M>
              {/* Nothing else in the product states this, so a project cannot otherwise tell whether
                  its tool output is covered. */}
              <Text.H6 color="foregroundMuted">
                Messages, tool calls and their results, reasoning, span attributes, and span events are always scanned.
              </Text.H6>
            </div>

            <div className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idPrefix}-metadata`}>Also scan metadata and tags</Label>
                <Text.H6 color="foregroundMuted">
                  The values you attach yourself, such as <span className="font-mono">plan</span> or{" "}
                  <span className="font-mono">region</span>. Off by default because scanning them can remove values you
                  filter and group by.
                </Text.H6>
              </div>
              <Switch
                id={`${idPrefix}-metadata`}
                checked={value.metadata}
                disabled={disabled}
                onCheckedChange={(checked) => onChange("metadata", checked)}
              />
            </div>
          </div>

          <div className="border-border border-t pt-6">
            <RedactionIdentityChoice
              idPrefix={idPrefix}
              value={value.identities}
              disabled={disabled}
              onChange={(next) => onChange("identities", next)}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
