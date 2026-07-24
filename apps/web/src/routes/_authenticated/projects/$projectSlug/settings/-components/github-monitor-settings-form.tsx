import {
  DEFAULT_REFERENCE_KEYWORDS,
  DEFAULT_RESOLVE_KEYWORDS,
  DEFAULT_UNRESOLVE_KEYWORDS,
  type GithubMonitorSettings,
  githubMonitorSettingsInputSchema,
} from "@domain/github"
import { Button, Checkbox, Switch, Text, useToast } from "@repo/ui"
import { type ReactNode, useId, useState } from "react"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { KeywordListEditor } from "./keyword-list-editor.tsx"

type KeywordListKey = "resolveKeywords" | "unresolveKeywords" | "referenceKeywords"
type KeywordErrors = Partial<Record<KeywordListKey, string>>

/**
 * The shared monitor-settings editor (5.12): monitor toggles, source toggles,
 * and the three magic-word lists. Used for the org defaults and, seeded with a
 * repo's effective settings, its override. Validated client-side against the
 * domain schema so keyword errors show inline before the round-trip; the server
 * re-validates. Remount (via a `key`) to reset the draft after a save.
 */
export function GithubMonitorSettingsForm({
  initial,
  submitLabel,
  onSubmit,
  extraActions,
  extraFields,
  submitDisabled = false,
}: {
  initial: GithubMonitorSettings
  submitLabel: string
  onSubmit: (settings: GithubMonitorSettings) => Promise<void>
  extraActions?: ReactNode
  /** Rendered above "What to watch" — used by the project override to attach a repo selector to the same save. */
  extraFields?: ReactNode
  submitDisabled?: boolean
}) {
  const { toast } = useToast()
  const fieldId = useId()
  const [draft, setDraft] = useState<GithubMonitorSettings>(initial)
  const [errors, setErrors] = useState<KeywordErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const setRules = (key: KeywordListKey, next: string[]) =>
    setDraft((current) => ({ ...current, rules: { ...current.rules, [key]: next } }))
  const setSource = (key: keyof GithubMonitorSettings["sources"], value: boolean) =>
    setDraft((current) => ({ ...current, sources: { ...current.sources, [key]: value } }))

  const handleSubmit = async () => {
    const parsed = githubMonitorSettingsInputSchema.safeParse(draft)
    if (!parsed.success) {
      const next: KeywordErrors = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "rules" && typeof issue.path[1] === "string") {
          const key = issue.path[1] as KeywordListKey
          next[key] ??= issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
      toast({ description: "Settings saved" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {extraFields}
      <div className="flex flex-col gap-3">
        <Text.H5 weight="semibold">What to watch</Text.H5>
        <ToggleRow
          label="Pull requests"
          description="Link and act on pull requests that target the configured branch."
          checked={draft.monitorPullRequests}
          onChange={(value) => setDraft((current) => ({ ...current, monitorPullRequests: value }))}
        />
        <ToggleRow
          label="Commits"
          description="Link and act on commits pushed to the configured branch."
          checked={draft.monitorCommits}
          onChange={(value) => setDraft((current) => ({ ...current, monitorCommits: value }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <Text.H5 weight="semibold">Where to look for references</Text.H5>
        <div className="flex flex-row flex-wrap gap-x-6 gap-y-2">
          <SourceCheckbox
            id={`${fieldId}-commit-message`}
            label="Commit messages"
            checked={draft.sources.commitMessage}
            onChange={(value) => setSource("commitMessage", value)}
          />
          <SourceCheckbox
            id={`${fieldId}-branch-name`}
            label="Branch names"
            checked={draft.sources.branchName}
            onChange={(value) => setSource("branchName", value)}
          />
          <SourceCheckbox
            id={`${fieldId}-pr-title`}
            label="Pull request titles"
            checked={draft.sources.prTitle}
            onChange={(value) => setSource("prTitle", value)}
          />
          <SourceCheckbox
            id={`${fieldId}-pr-body`}
            label="Pull request descriptions"
            checked={draft.sources.prBody}
            onChange={(value) => setSource("prBody", value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Text.H5 weight="semibold">Magic words</Text.H5>
          <Text.H6 color="foregroundMuted">
            A signal slug (e.g. LAT-XY9Z) next to one of these words in a watched source links the PR or commit, and on
            merge applies the action.
          </Text.H6>
        </div>
        <KeywordListEditor
          label="Resolve"
          value={draft.rules.resolveKeywords}
          onChange={(next) => setRules("resolveKeywords", next)}
          error={errors.resolveKeywords}
          onReset={() => setRules("resolveKeywords", [...DEFAULT_RESOLVE_KEYWORDS])}
        />
        <KeywordListEditor
          label="Reopen"
          value={draft.rules.unresolveKeywords}
          onChange={(next) => setRules("unresolveKeywords", next)}
          error={errors.unresolveKeywords}
          onReset={() => setRules("unresolveKeywords", [...DEFAULT_UNRESOLVE_KEYWORDS])}
        />
        <KeywordListEditor
          label="Reference"
          value={draft.rules.referenceKeywords}
          onChange={(next) => setRules("referenceKeywords", next)}
          error={errors.referenceKeywords}
          onReset={() => setRules("referenceKeywords", [...DEFAULT_REFERENCE_KEYWORDS])}
        />
      </div>

      <div className="flex flex-row items-center gap-2">
        <Button onClick={() => void handleSubmit()} isLoading={submitting} disabled={submitDisabled}>
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Text.H6 weight="medium">{label}</Text.H6>
        {description ? <Text.H6 color="foregroundMuted">{description}</Text.H6> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SourceCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Text.H6>{label}</Text.H6>
    </label>
  )
}
