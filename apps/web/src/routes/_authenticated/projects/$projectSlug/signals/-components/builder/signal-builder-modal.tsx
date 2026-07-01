import { DEFAULT_EVALUATION_SAMPLING, type SignalPreviewResult } from "@domain/evaluations"
import type { EvaluationRuleCondition, EvaluationSettings, FilterSet } from "@domain/shared"
import { Button, Input, Modal, Tabs, Text, Textarea, useMountEffect, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { useRef, useState } from "react"
import {
  invalidateSignalQueries,
  runSignalPreview,
  useCreateSignal,
  useUpdateSignal,
  useUpdateSignalEvaluation,
} from "../../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import { isConditionValid } from "./condition-meta.tsx"
import { ConditionEditor, type ConditionEditState, RuleConditionList, type RuleDraft } from "./rule-detector-editor.tsx"
import { SignalPreviewStep } from "./signal-preview-step.tsx"
import { SignalScopeEditor } from "./signal-scope-editor.tsx"
import { StepIndicator } from "./step-indicator.tsx"

type DetectorTab = "rules" | "llm" | "advanced"
type StepId = "scope" | "detector" | "test" | "details"

const CREATE_STEPS: readonly StepId[] = ["scope", "detector", "test", "details"]
const EDIT_STEPS: readonly StepId[] = ["scope", "detector", "test"]

const STEP_TITLE: Record<StepId, string> = {
  scope: "Scope",
  detector: "Evaluation",
  test: "Test",
  details: "Details",
}

const emptyRuleDraft: RuleDraft = { match: "all", conditions: [] }

const filterSetOrNull = (filter: FilterSet): FilterSet | null => (Object.keys(filter).length === 0 ? null : filter)

export interface SignalBuilderInitial {
  readonly signalId: string
  readonly filters: FilterSet | null
  readonly settings: EvaluationSettings
  readonly sampling: number
}

function detectorPayload(
  tab: DetectorTab,
  ruleDraft: RuleDraft,
  criteria: string,
): { settings: EvaluationSettings } | null {
  if (tab === "rules") {
    if (ruleDraft.conditions.length === 0) return null
    return { settings: { kind: "rule", match: ruleDraft.match, conditions: [...ruleDraft.conditions] } }
  }
  if (tab === "llm") {
    if (criteria.trim().length === 0) return null
    return { settings: { kind: "judge", criteria: criteria.trim() } }
  }
  return null
}

/**
 * The Signal Builder wizard. Create mode runs four steps (scope → detector →
 * test → details); edit mode runs the first three and saves filters + settings.
 * Mount only while open; reset via `key`.
 */
export function SignalBuilderModal({
  projectId,
  projectSlug,
  mode,
  initial,
  initialFilters,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly mode: "create" | "edit"
  readonly initial?: SignalBuilderInitial
  /** Create-mode seed (e.g. from "Create signal from this search"); ignored in edit mode. */
  readonly initialFilters?: FilterSet | null
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const createSignal = useCreateSignal(projectId)
  const updateSignal = useUpdateSignal(projectId, initial?.signalId ?? "")
  const updateSignalEvaluation = useUpdateSignalEvaluation(projectId, initial?.signalId ?? "")

  const steps = mode === "edit" ? EDIT_STEPS : CREATE_STEPS
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex] ?? "scope"

  const [filters, setFilters] = useState<FilterSet>(initial?.filters ?? initialFilters ?? {})
  const [tab, setTab] = useState<DetectorTab>(() => (initial?.settings?.kind === "judge" ? "llm" : "rules"))
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() =>
    initial?.settings?.kind === "rule"
      ? { match: initial.settings.match, conditions: initial.settings.conditions }
      : emptyRuleDraft,
  )
  const [criteria, setCriteria] = useState(() => (initial?.settings?.kind === "judge" ? initial.settings.criteria : ""))
  const [sampling, setSampling] = useState<number>(initial?.sampling ?? DEFAULT_EVALUATION_SAMPLING)
  const [conditionEdit, setConditionEdit] = useState<ConditionEditState>(null)
  const [draftCondition, setDraftCondition] = useState<EvaluationRuleCondition | null>(null)

  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState("")
  const [descriptionError, setDescriptionError] = useState<string | undefined>(undefined)

  const [previewResult, setPreviewResult] = useState<SignalPreviewResult | null>(null)
  const [previewRunning, setPreviewRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const previewAbortRef = useRef<AbortController | null>(null)
  // Cancel any in-flight preview poll when the modal unmounts (close) so it stops
  // polling and can't resolve onto an unmounted component.
  useMountEffect(() => () => previewAbortRef.current?.abort())

  const evaluation = detectorPayload(tab, ruleDraft, criteria)
  const detectorValid = evaluation !== null

  const runPreview = (): void => {
    const payload = detectorPayload(tab, ruleDraft, criteria)
    if (payload === null) {
      setPreviewResult({ status: "error", error: "Add a valid evaluation before running a preview." })
      return
    }
    // A re-run supersedes any in-flight poll so the stale result can't overwrite the new one.
    previewAbortRef.current?.abort()
    const controller = new AbortController()
    previewAbortRef.current = controller
    setPreviewRunning(true)
    void runSignalPreview({
      projectId,
      evaluation: payload,
      filters: filterSetOrNull(filters),
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setPreviewResult(result)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPreviewResult({ status: "error", error: toUserMessage(error) })
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewRunning(false)
      })
  }

  const goToStep = (nextIndex: number) => {
    const next = steps[nextIndex]
    if (!next) return
    setStepIndex(nextIndex)
    if (next === "test") runPreview()
  }

  const openConditionEditor = (state: ConditionEditState) => {
    if (state === null) {
      setConditionEdit(null)
      setDraftCondition(null)
      return
    }
    // No type is auto-selected for a new condition; the user picks from the type list.
    const existing = state.index !== "new" ? ruleDraft.conditions[state.index] : undefined
    setDraftCondition(existing ?? null)
    setConditionEdit(state)
  }

  const confirmCondition = () => {
    if (conditionEdit === null || draftCondition === null) return
    const conditions =
      conditionEdit.index === "new"
        ? [...ruleDraft.conditions, draftCondition]
        : ruleDraft.conditions.map((c, i) => (i === conditionEdit.index ? draftCondition : c))
    setRuleDraft({ ...ruleDraft, conditions })
    setConditionEdit(null)
    setDraftCondition(null)
  }

  const handleCreate = async () => {
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (trimmedName.length === 0) {
      setNameError("Name is required")
      return
    }
    if (trimmedDescription.length === 0) {
      setDescriptionError("Description is required")
      return
    }
    if (evaluation === null) {
      toast({ variant: "destructive", description: "Add a valid evaluation before creating the signal." })
      return
    }
    setIsSaving(true)
    try {
      const result = await createSignal.mutateAsync({
        name: trimmedName,
        description: trimmedDescription,
        filters: filterSetOrNull(filters),
        sampling,
        evaluation,
      })
      toast({ description: "Signal created." })
      onClose()
      void navigate({
        to: "/projects/$projectSlug/signals/$signalId",
        params: { projectSlug, signalId: result.signalId },
      })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!initial) return
    if (evaluation === null) {
      toast({ variant: "destructive", description: "Add a valid evaluation before saving." })
      return
    }
    const detectorChanged = JSON.stringify(evaluation.settings) !== JSON.stringify(initial.settings)
    const samplingChanged = sampling !== initial.sampling
    const filtersChanged = JSON.stringify(filterSetOrNull(filters)) !== JSON.stringify(initial.filters ?? null)
    setIsSaving(true)
    try {
      if (filtersChanged) {
        await updateSignal.mutateAsync({ filters: filterSetOrNull(filters) })
      }
      if (detectorChanged || samplingChanged) {
        await updateSignalEvaluation.mutateAsync({ settings: evaluation.settings, sampling })
      }
      await invalidateSignalQueries(projectId, initial.signalId)
      toast({ description: "Signal updated." })
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsSaving(false)
    }
  }

  const isLastStep = stepIndex === steps.length - 1
  const inConditionSubStep = step === "detector" && conditionEdit !== null

  const advancedTabOption = {
    id: "advanced" as const,
    label: "Advanced",
    tooltip: <Text.H6>Coming soon</Text.H6>,
  }

  const footer = inConditionSubStep ? (
    <>
      <Button variant="outline" onClick={() => openConditionEditor(null)}>
        Cancel
      </Button>
      <Button onClick={confirmCondition} disabled={draftCondition === null || !isConditionValid(draftCondition)}>
        {conditionEdit?.index === "new" ? "Add condition" : "Save condition"}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" disabled={stepIndex === 0 || isSaving} onClick={() => goToStep(stepIndex - 1)}>
        Back
      </Button>
      {isLastStep ? (
        mode === "create" ? (
          <Button onClick={() => void handleCreate()} disabled={isSaving} isLoading={isSaving}>
            Create signal
          </Button>
        ) : (
          <Button onClick={() => void handleSaveEdit()} disabled={isSaving} isLoading={isSaving}>
            Save changes
          </Button>
        )
      ) : (
        <Button disabled={(step === "detector" && !detectorValid) || isSaving} onClick={() => goToStep(stepIndex + 1)}>
          Next
        </Button>
      )}
    </>
  )

  return (
    <Modal
      open
      dismissible
      size="large"
      scrollable={false}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={mode === "create" ? "New signal" : "Edit signal evaluation"}
      description={
        <StepIndicator
          steps={steps.map((id) => ({ id, label: STEP_TITLE[id] }))}
          activeIndex={stepIndex}
          onStepClick={goToStep}
        />
      }
      footer={footer}
    >
      {/* Fixed-height body so the modal does not resize between steps; content scrolls internally.
          `overflow-y-auto` also clips horizontally, so `-mx-2 px-2` (absorbed by the modal's px-6)
          gives focus rings and popover offsets a few px of clip headroom without insetting content. */}
      <div className="-mx-2 flex h-[28rem] flex-col gap-4 overflow-y-auto px-2 pb-6">
        {step === "scope" ? (
          <SignalScopeEditor
            projectId={projectId}
            value={filters}
            onChange={setFilters}
            sampling={sampling}
            onSamplingChange={setSampling}
          />
        ) : null}

        {step === "detector" && !inConditionSubStep ? (
          <div className="flex flex-col gap-4">
            <Tabs<DetectorTab>
              variant="bordered"
              size="sm"
              options={[{ id: "rules", label: "Rules" }, { id: "llm", label: "LLM" }, advancedTabOption]}
              active={tab}
              onSelect={(next) => {
                if (next === "advanced") return
                setTab(next)
              }}
            />
            {tab === "rules" ? (
              <RuleConditionList draft={ruleDraft} onChange={setRuleDraft} onEditCondition={openConditionEditor} />
            ) : null}
            {tab === "llm" ? (
              <div className="flex flex-col gap-1.5">
                <Textarea
                  label="Criteria"
                  minRows={3}
                  value={criteria}
                  onChange={(event) => setCriteria(event.target.value)}
                  placeholder={
                    'e.g. "The user grew frustrated — repeating themselves, complaining, or giving up before getting a useful answer."'
                  }
                />
                <Text.H6 color="foregroundMuted">
                  Describe the behavior to detect. A trace joins this signal when the behavior is present.
                </Text.H6>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "detector" && inConditionSubStep ? (
          <ConditionEditor
            draftCondition={draftCondition}
            onDraftConditionChange={setDraftCondition}
            onClearType={() => setDraftCondition(null)}
            projectId={projectId}
            title={conditionEdit?.index === "new" ? "Add condition" : "Edit condition"}
            onBack={() => openConditionEditor(null)}
          />
        ) : null}

        {step === "test" ? (
          <SignalPreviewStep
            result={previewResult}
            isRunning={previewRunning}
            onRun={runPreview}
            projectId={projectId}
          />
        ) : null}

        {step === "details" ? (
          <div className="flex flex-col gap-4">
            <Input
              required
              autoFocus
              label="Name"
              placeholder="Frustrated users"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (nameError) setNameError(undefined)
              }}
              {...(nameError ? { errors: [nameError] } : {})}
            />
            <Textarea
              label="Description"
              placeholder="What does this signal detect?"
              minRows={2}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                if (descriptionError) setDescriptionError(undefined)
              }}
              {...(descriptionError ? { errors: [descriptionError] } : {})}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
