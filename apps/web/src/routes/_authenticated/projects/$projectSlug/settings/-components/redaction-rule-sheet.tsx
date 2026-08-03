import type { RedactionRule, RedactionRuleKind } from "@domain/shared"
import type { RuleValidation } from "@domain/spans"
import { Button, Input, Label, Select, Sheet, Switch, Text } from "@repo/ui"
import { useEffect, useState } from "react"
import { validateRedactionRuleDraft } from "../../../../../../domains/projects/projects.functions.ts"
import {
  isRuleDraftReady,
  labelIssue,
  newRuleDraft,
  REDACTION_RULE_KIND_META,
  REDACTION_RULE_KIND_ORDER,
  toRuleLabel,
} from "../../../../../../domains/projects/redaction-rule-drafts.ts"
import { KeywordListEditor } from "./keyword-list-editor.tsx"

const KIND_OPTIONS = REDACTION_RULE_KIND_ORDER.map((kind) => ({
  label: REDACTION_RULE_KIND_META[kind].label,
  value: kind,
}))

/** Long enough that typing a pattern does not fire a request per keystroke. */
const VALIDATE_DEBOUNCE_MS = 400

export function RedactionRuleSheet({
  open,
  rule,
  onClose,
  onSave,
}: {
  readonly open: boolean
  /** The rule being edited, or `null` when adding. */
  readonly rule: RedactionRule | null
  readonly onClose: () => void
  readonly onSave: (rule: RedactionRule) => void
}) {
  const [draft, setDraft] = useState<RedactionRule>(rule ?? newRuleDraft("terms"))
  const [validation, setValidation] = useState<RuleValidation | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Re-seed whenever the sheet opens on a different rule; the row that opened it owns the choice.
  useEffect(() => {
    if (!open) return
    setDraft(rule ?? newRuleDraft("terms"))
    setValidation(null)
  }, [open, rule])

  const ready = isRuleDraftReady(draft)

  useEffect(() => {
    if (!open || !ready) {
      setValidation(null)
      return
    }

    let cancelled = false
    setIsValidating(true)
    const timer = setTimeout(() => {
      validateRedactionRuleDraft({ data: { rule: draft } })
        .then((next) => {
          if (!cancelled) setValidation(next)
        })
        .catch(() => {
          if (!cancelled) setValidation(null)
        })
        .finally(() => {
          if (!cancelled) setIsValidating(false)
        })
    }, VALIDATE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      setIsValidating(false)
    }
  }, [open, ready, draft])

  const changeKind = (kind: RedactionRuleKind) => {
    // Kind-specific fields cannot carry over, so keep only what every kind shares.
    setDraft({ ...newRuleDraft(kind), id: draft.id, label: draft.label })
  }

  const labelError = labelIssue(draft.label)
  const canSave = ready && labelError === undefined && validation?.ok === true

  return (
    <Sheet open={open} onClose={onClose} closeAriaLabel="Close rule editor">
      {/* `Sheet` paints only the backdrop and leaves its panel transparent and shrink-to-fit, so the
          background, the border and an explicit width belong here — the same job `DetailDrawer` does
          for every other consumer. Without the background the page shows straight through the panel. */}
      <div className="flex h-full w-[34rem] max-w-[100vw] flex-col gap-6 overflow-y-auto border-border border-l bg-background p-6">
        <div className="flex flex-col gap-1">
          <Text.H4M>{rule ? "Edit rule" : "Add a rule"}</Text.H4M>
          <Text.H6 color="foregroundMuted">
            Rules apply only to spans ingested after you save, and what they remove cannot be recovered.
          </Text.H6>
        </div>

        <Select
          name="rule-kind"
          label="Kind"
          options={KIND_OPTIONS}
          value={draft.kind}
          onChange={(next) => changeKind(next as RedactionRuleKind)}
        />
        <Text.H6 color="foregroundMuted">{REDACTION_RULE_KIND_META[draft.kind].description}</Text.H6>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-label">Label</Label>
          <Input
            id="rule-label"
            value={draft.label}
            placeholder="ACCOUNT_NUMBER"
            onChange={(event) => setDraft({ ...draft, label: toRuleLabel(event.target.value) })}
          />
          <Text.H6 color={labelError ? "destructive" : "foregroundMuted"}>
            {labelError ?? `Matches appear in stored content as [REDACTED_${draft.label || "LABEL"}].`}
          </Text.H6>
        </div>

        {draft.kind === "attribute_key" ? (
          <KeywordListEditor
            label="Attribute keys"
            value={draft.keys}
            onChange={(keys) => setDraft({ ...draft, keys })}
          />
        ) : null}

        {draft.kind === "terms" ? (
          <>
            <KeywordListEditor label="Terms" value={draft.terms} onChange={(terms) => setDraft({ ...draft, terms })} />
            <div className="flex flex-row items-center justify-between gap-4">
              <Label htmlFor="rule-whole-word">Match whole words only</Label>
              <Switch
                id="rule-whole-word"
                checked={draft.wholeWord !== false}
                onCheckedChange={(checked) => setDraft({ ...draft, wholeWord: checked })}
              />
            </div>
            <div className="flex flex-row items-center justify-between gap-4">
              <Label htmlFor="rule-case">Match case exactly</Label>
              <Switch
                id="rule-case"
                checked={draft.caseSensitive === true}
                onCheckedChange={(checked) => setDraft({ ...draft, caseSensitive: checked })}
              />
            </div>
          </>
        ) : null}

        {draft.kind === "pattern" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-pattern">Pattern</Label>
              <Input
                id="rule-pattern"
                value={draft.pattern}
                placeholder="ACCT-\d{9}"
                onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}
              />
            </div>
            <div className="flex flex-row items-center justify-between gap-4">
              <Label htmlFor="rule-ignore-case">Ignore case</Label>
              <Switch
                id="rule-ignore-case"
                checked={draft.ignoreCase === true}
                onCheckedChange={(checked) => setDraft({ ...draft, ignoreCase: checked })}
              />
            </div>
          </>
        ) : null}

        <RuleVerdict isValidating={isValidating} ready={ready} validation={validation} />

        <div className="mt-auto flex flex-row justify-end gap-2 border-border border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              onSave(
                draft.kind === "pattern" && validation
                  ? { ...draft, validatorVersion: validation.validatorVersion }
                  : draft,
              )
            }
          >
            Save rule
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Says whether the rule is safe to run, and points at the preview for whether it removes the right
 * things. It deliberately makes no judgement about over-breadth: only the customer's own data can
 * answer that, and the preview reads it.
 */
function RuleVerdict({
  isValidating,
  ready,
  validation,
}: {
  readonly isValidating: boolean
  readonly ready: boolean
  readonly validation: RuleValidation | null
}) {
  if (!ready) {
    return <Text.H6 color="foregroundMuted">Fill in a label and at least one value to check this rule.</Text.H6>
  }
  if (isValidating || !validation) return <Text.H6 color="foregroundMuted">Checking the rule…</Text.H6>

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      {validation.errors.map((issue) => (
        <Text.H6 key={issue.code} color="destructive">
          This rule {issue.message}.
        </Text.H6>
      ))}
      {validation.ok ? (
        <Text.H6 color="foregroundMuted">
          This rule is valid. Save it, then use <span className="font-medium">Check against recent spans</span> to see
          what it would remove from this project's data.
        </Text.H6>
      ) : null}
    </div>
  )
}
