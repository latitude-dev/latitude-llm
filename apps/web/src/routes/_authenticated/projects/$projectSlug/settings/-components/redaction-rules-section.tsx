import type { RedactionRule } from "@domain/shared"
import { Badge, Button, Icon, Text } from "@repo/ui"
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
 */
export function RedactionRulesSection({
  /** Canonical JSON, so a flat draft overlay can compare it by value. */
  value,
  disabled = false,
  onChange,
}: {
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
    <div className="flex flex-col gap-4 border-border border-t pt-6">
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
        <div className="flex flex-col rounded-md border border-border">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-row items-center gap-3 border-border border-b p-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-row items-center gap-2">
                  <Text.H6M>{rule.label}</Text.H6M>
                  <Badge variant="muted" size="normal">
                    {REDACTION_RULE_KIND_META[rule.kind].label}
                  </Badge>
                  {rule.enabled === false ? (
                    <Badge variant="outlineMuted" size="normal">
                      Off
                    </Badge>
                  ) : null}
                  {duplicateLabels.has(rule.label) ? (
                    <Text.H6 color="warningMutedForeground">shares a label, so their counts merge</Text.H6>
                  ) : null}
                </div>
                <Text.H6 color="foregroundMuted" ellipsis noWrap>
                  <span className="font-mono">{describeRule(rule)}</span>
                </Text.H6>
              </div>

              {disabled ? null : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => write(withRuleReplaced(rules, { ...rule, enabled: rule.enabled === false }))}
                  >
                    {rule.enabled === false ? "Turn on" : "Turn off"}
                  </Button>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${rule.label}`}
                    onClick={() => write(rules.filter((entry) => entry.id !== rule.id))}
                  >
                    <Icon icon={X} size="sm" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
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

/** Two enabled rules sharing a label merge their match counts, which is legal but worth surfacing. */
function labelsUsedTwice(rules: readonly RedactionRule[]): Set<string> {
  const seen = new Set<string>()
  const twice = new Set<string>()

  for (const rule of rules) {
    if (seen.has(rule.label)) twice.add(rule.label)
    seen.add(rule.label)
  }

  return twice
}
