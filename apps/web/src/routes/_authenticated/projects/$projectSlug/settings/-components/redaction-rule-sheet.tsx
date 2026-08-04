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

// One state, not a nullable verdict plus a flag: "no verdict" cannot mean both checking and failed.
type Verdict =
  | { readonly status: "checking" }
  | { readonly status: "checked"; readonly validation: RuleValidation }
  | { readonly status: "unavailable" }

const CHECKING: Verdict = { status: "checking" }

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
  const [verdict, setVerdict] = useState<Verdict>(CHECKING)

  // Re-seed whenever the sheet opens on a different rule; the row that opened it owns the choice.
  useEffect(() => {
    if (!open) return
    setDraft(rule ?? newRuleDraft("terms"))
    setVerdict(CHECKING)
  }, [open, rule])

  const ready = isRuleDraftReady(draft)

  useEffect(() => {
    if (!open || !ready) {
      setVerdict(CHECKING)
      return
    }

    let cancelled = false
    // The previous draft's verdict is not an answer about this one, and Save would stamp it.
    setVerdict(CHECKING)
    const timer = setTimeout(() => {
      validateRedactionRuleDraft({ data: { rule: draft } })
        .then((validation) => {
          if (!cancelled) setVerdict({ status: "checked", validation })
        })
        .catch(() => {
          if (!cancelled) setVerdict({ status: "unavailable" })
        })
    }, VALIDATE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, ready, draft])

  const changeKind = (kind: RedactionRuleKind) => {
    // Kind-specific fields cannot carry over, so keep only what every kind shares.
    setDraft({ ...newRuleDraft(kind), id: draft.id, label: draft.label })
  }

  const labelError = labelIssue(draft.label)
  const canSave = ready && labelError === undefined && verdict.status === "checked" && verdict.validation.ok

  return (
    <Sheet open={open} onClose={onClose} closeAriaLabel="Close rule editor">
      {/* `Sheet` paints only the backdrop, so the panel's own background, border and width belong here. */}
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

        <RuleVerdict ready={ready} verdict={verdict} />

        <div className="mt-auto flex flex-row justify-end gap-2 border-border border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              onSave(
                draft.kind === "pattern" && verdict.status === "checked"
                  ? { ...draft, validatorVersion: verdict.validation.validatorVersion }
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

// Says whether the rule is safe to run; over-breadth is the preview's question, not this one's.
function RuleVerdict({ ready, verdict }: { readonly ready: boolean; readonly verdict: Verdict }) {
  if (!ready) {
    return <Text.H6 color="foregroundMuted">Fill in a label and at least one value to check this rule.</Text.H6>
  }
  if (verdict.status === "checking") return <Text.H6 color="foregroundMuted">Checking the rule…</Text.H6>
  if (verdict.status === "unavailable") {
    return (
      <Text.H6 color="destructive">
        Could not check this rule. Saving stays disabled until the check succeeds, so edit the rule to try again.
      </Text.H6>
    )
  }

  const { validation } = verdict

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
