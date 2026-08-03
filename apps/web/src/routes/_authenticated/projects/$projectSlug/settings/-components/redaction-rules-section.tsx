import type { RedactionRule } from "@domain/shared"
import { Button, Checkbox, Icon, Label, Text } from "@repo/ui"
import { Pencil, Plus, X } from "lucide-react"
import { useState } from "react"
import {
  decodeRules,
  describeRule,
  encodeRules,
  REDACTION_RULE_KIND_META,
  withRuleReplaced,
} from "../../../../../../domains/projects/redaction-rule-drafts.ts"
import { RedactionRuleSheet } from "./redaction-rule-sheet.tsx"

/**
 * Custom rules, rendered as a section of `RedactionCard` rather than a card of its own.
 *
 * Rules are part of the scoped policy — they resolve project → organization like the categories
 * do — so they have to sit inside whatever the Set by selector governs. Living in `RedactionCard`
 * also means the organization modal gets them from the same code path as the project page.
 *
 * A rule row is deliberately the same row as a category above it: both answer "what to redact", so
 * both are a checkbox, a label, and a line saying what it matches. The only real difference is that
 * a rule can be edited and removed, which is the two trailing actions and nothing else.
 */
export function RedactionRulesSection({
  idPrefix,
  /** Canonical JSON, so a flat draft overlay can compare it by value. */
  value,
  disabled = false,
  onChange,
}: {
  readonly idPrefix: string
  readonly value: string
  readonly disabled?: boolean
  readonly onChange: (next: string) => void
}) {
  const [editing, setEditing] = useState<RedactionRule | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const rules = decodeRules(value)
  const duplicateLabels = labelsUsedTwice(rules)

  const write = (next: readonly RedactionRule[]) => onChange(encodeRules(next))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Text.H6M>Custom rules</Text.H6M>
          <Text.H6 color="foregroundMuted">Identifier formats specific to you, on top of the categories above.</Text.H6>
        </div>
        {disabled ? null : (
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null)
              setIsSheetOpen(true)
            }}
          >
            <Icon icon={Plus} size="sm" />
            Add rule
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <Text.H6 color="foregroundMuted">No custom rules yet.</Text.H6>
      ) : (
        rules.map((rule) => {
          const id = `${idPrefix}-rule-${rule.id}`

          return (
            <div key={rule.id} className="flex flex-row items-start gap-3">
              <Checkbox
                id={id}
                checked={rule.enabled !== false}
                disabled={disabled}
                onCheckedChange={(checked) => write(withRuleReplaced(rules, { ...rule, enabled: checked === true }))}
                aria-label={rule.label}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor={id}>{rule.label}</Label>
                <Text.H6 color="foregroundMuted" ellipsis noWrap>
                  {REDACTION_RULE_KIND_META[rule.kind].label} · <span className="font-mono">{describeRule(rule)}</span>
                </Text.H6>
                {duplicateLabels.has(rule.label) ? (
                  <Text.H6 color="warningMutedForeground">
                    Another rule uses this label, so their match counts are reported together.
                  </Text.H6>
                ) : null}
              </div>

              {disabled ? null : (
                <div className="flex shrink-0 flex-row items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${rule.label}`}
                    onClick={() => {
                      setEditing(rule)
                      setIsSheetOpen(true)
                    }}
                  >
                    <Icon icon={Pencil} size="sm" />
                  </Button>
                  {/* No confirmation: the page holds this until Apply, so Discard already undoes it. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${rule.label}`}
                    onClick={() => write(rules.filter((entry) => entry.id !== rule.id))}
                  >
                    <Icon icon={X} size="sm" />
                  </Button>
                </div>
              )}
            </div>
          )
        })
      )}

      <RedactionRuleSheet
        open={isSheetOpen}
        rule={editing}
        onClose={() => setIsSheetOpen(false)}
        onSave={(rule) => {
          write(withRuleReplaced(rules, rule))
          setIsSheetOpen(false)
        }}
      />
    </div>
  )
}

/** Two rules sharing a label merge their match counts, which is legal but worth surfacing. */
function labelsUsedTwice(rules: readonly RedactionRule[]): Set<string> {
  const seen = new Set<string>()
  const twice = new Set<string>()

  for (const rule of rules) {
    if (seen.has(rule.label)) twice.add(rule.label)
    seen.add(rule.label)
  }

  return twice
}
