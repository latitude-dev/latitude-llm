import { compileSettingsToScript, DEFAULT_EVALUATION_SAMPLING, type SignalPreviewResult } from "@domain/evaluations"
import type { EvaluationRuleCondition, EvaluationSettings, FilterSet } from "@domain/shared"
import { Button, Input, Modal, Tabs, Text, Textarea, useMountEffect, useStagedStatus, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { useRef, useState } from "react"
import {
  invalidateSignalQueries,
  runSignalGeneration,
  runSignalPreview,
  useCreateSignal,
  useUpdateSignal,
  useUpdateSignalEvaluation,
} from "../../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import { AdvancedDetectorEditor } from "./advanced-detector-editor.tsx"
import { isConditionValid } from "./condition-meta.tsx"
import { DescribeSignalIntro } from "./describe-signal-intro.tsx"
import { JudgeDetectorEditor } from "./judge-detector-editor.tsx"
import { ConditionEditor, type ConditionEditState, RuleConditionList, type RuleDraft } from "./rule-detector-editor.tsx"
import { SignalPreviewStep } from "./signal-preview-step.tsx"
import { SignalScopeEditor } from "./signal-scope-editor.tsx"
import { StepIndicator } from "./step-indicator.tsx"

type DetectorTab = "rules" | "llm" | "advanced"
type StepId = "detector" | "scope" | "test" | "details"
type EditTab = "detector" | "scope" | "test"

const DETECTOR_TABS: ReadonlyArray<{ readonly id: DetectorTab; readonly title: string }> = [
  {
    id: "rules",
    title: "Set of conditions",
  },
  {
    id: "llm",
    title: "LLM as judge",
  },
  {
    id: "advanced",
    title: "Custom script",
  },
]

const CREATE_STEPS: readonly StepId[] = ["detector", "scope", "test", "details"]

const STEP_TITLE: Record<StepId, string> = {
  detector: "Evaluation",
  scope: "Scope",
  test: "Test",
  details: "Details",
}

const EDIT_TAB_OPTIONS: { readonly id: EditTab; readonly label: string }[] = [
  { id: "detector", label: "Evaluation" },
  { id: "scope", label: "Scope" },
  { id: "test", label: "Test" },
]

// Mocked progress timeline while generation does not stream steps; a real worker step,
// when one arrives, overrides it.
const GENERATION_STAGES = [
  { atSeconds: 0, label: "Reading your description" },
  { atSeconds: 4, label: "Drafting the evaluation" },
  { atSeconds: 12, label: "Choosing scope and sampling" },
  { atSeconds: 20, label: "Testing it against recent sessions" },
  { atSeconds: 28, label: "Creating the signal" },
]

const emptyRuleDraft: RuleDraft = { match: "all", conditions: [] }
const DEFAULT_ADVANCED_SCRIPT_PLACEHOLDER = compileSettingsToScript({
  kind: "rule",
  match: "any",
  conditions: [{ type: "error" }],
})

const filterSetOrNull = (filter: FilterSet): FilterSet | null => (Object.keys(filter).length === 0 ? null : filter)

/** How the signal's active evaluation was authored: a declarative settings form, or a raw Advanced script. */
export type SignalBuilderDetector =
  | { readonly kind: "settings"; readonly settings: EvaluationSettings }
  | { readonly kind: "script"; readonly script: string }

export interface SignalBuilderInitial {
  readonly signalId: string
  readonly filters: FilterSet | null
  readonly detector: SignalBuilderDetector
  readonly sampling: number
}

type DetectorPayload = { settings: EvaluationSettings } | { script: string }

function detectorPayload(
  tab: DetectorTab,
  ruleDraft: RuleDraft,
  criteria: string,
  scriptDraft: string,
): DetectorPayload | null {
  if (tab === "rules") {
    if (ruleDraft.conditions.length === 0) return null
    return { settings: { kind: "rule", match: ruleDraft.match, conditions: [...ruleDraft.conditions] } }
  }
  if (tab === "llm") {
    if (criteria.trim().length === 0) return null
    return { settings: { kind: "judge", criteria: criteria.trim() } }
  }
  const script = scriptDraft.trim()
  return script.length === 0 ? null : { script }
}

function StepHeading({ title, hint }: { readonly title: string; readonly hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text.H5>{title}</Text.H5>
      <Text.H6 color="foregroundMuted">{hint}</Text.H6>
    </div>
  )
}

/**
 * The Signal Builder. Create mode opens on the describe-first intro (a shortcut,
 * not a wizard step) where one prompt generates and creates the whole signal;
 * "Configure manually" runs the wizard (evaluation → scope → test → details)
 * instead, and Back on the first step returns to the intro.
 * Edit mode is tabbed (Evaluation | Scope | Test) so users can jump straight to
 * what they're changing, and saves only what changed. Mount only while open;
 * reset via `key`.
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

  const [stepIndex, setStepIndex] = useState(0)
  const step = CREATE_STEPS[stepIndex] ?? "detector"
  const [editTab, setEditTab] = useState<EditTab>("detector")
  // The describe-first intro is a shortcut into the wizard, not a step: it never appears
  // in the step indicator, and is only reachable again via Back on the first step.
  const [methodChosen, setMethodChosen] = useState(mode === "edit")

  const initialSettings = initial?.detector.kind === "settings" ? initial.detector.settings : null
  const initialScript = initial?.detector.kind === "script" ? initial.detector.script : ""

  const [filters, setFilters] = useState<FilterSet>(initial?.filters ?? initialFilters ?? {})
  const [tab, setTab] = useState<DetectorTab>(() =>
    initial?.detector.kind === "script" ? "advanced" : initialSettings?.kind === "judge" ? "llm" : "rules",
  )
  // The settings tab whose draft the Custom script tab renders as compiled code.
  const [lastSettingsTab, setLastSettingsTab] = useState<"rules" | "llm">(() =>
    initialSettings?.kind === "judge" ? "llm" : "rules",
  )
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() =>
    initialSettings?.kind === "rule"
      ? { match: initialSettings.match, conditions: initialSettings.conditions }
      : emptyRuleDraft,
  )
  const [criteria, setCriteria] = useState(() => (initialSettings?.kind === "judge" ? initialSettings.criteria : ""))
  const [scriptDraft, setScriptDraft] = useState(() => initialScript)
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
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const previewAbortRef = useRef<AbortController | null>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const stagedStep = useStagedStatus(GENERATION_STAGES, generating)
  // Cancel any in-flight preview or generation poll when the modal unmounts (close) so it
  // stops polling and can't resolve onto an unmounted component. Generation runs in a
  // worker: aborting only stops polling, the signal is still created.
  useMountEffect(() => () => {
    previewAbortRef.current?.abort()
    generationAbortRef.current?.abort()
  })

  // The Custom script tab without a raw script is a *view* of the active settings draft: preview
  // and save keep using the settings payload, so merely looking at the compiled code never
  // re-authors the evaluation. Only "Edit as custom script" (detach) flips it to a raw script.
  const settingsPayload = detectorPayload(lastSettingsTab, ruleDraft, criteria, "")
  const compiledView =
    settingsPayload !== null && "settings" in settingsPayload
      ? { kind: settingsPayload.settings.kind, script: compileSettingsToScript(settingsPayload.settings) }
      : null
  const evaluation =
    tab === "advanced" && scriptDraft.trim().length === 0 && settingsPayload !== null
      ? settingsPayload
      : detectorPayload(tab, ruleDraft, criteria, scriptDraft)
  const detectorValid = evaluation !== null

  const runPreview = (): void => {
    const payload = evaluation
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
    const next = CREATE_STEPS[nextIndex]
    if (!next) return
    setStepIndex(nextIndex)
    if (next === "test") runPreview()
  }

  const selectEditTab = (next: EditTab) => {
    setEditTab(next)
    if (next === "test") runPreview()
  }

  const selectDetectorTab = (next: DetectorTab) => {
    setTab(next)
    if (next !== "advanced") setLastSettingsTab(next)
  }

  const detachToScript = () => {
    if (compiledView === null) return
    setScriptDraft(compiledView.script)
    setRuleDraft(emptyRuleDraft)
    setCriteria("")
  }

  const handleGenerated = ({ signalId }: { readonly signalId: string }) => {
    toast({ description: "Signal created." })
    void invalidateSignalQueries(projectId)
    onClose()
    void navigate({
      to: "/projects/$projectSlug/signals/$signalId",
      params: { projectSlug, signalId },
    })
  }

  const generate = (): void => {
    const trimmed = prompt.trim()
    if (trimmed.length === 0 || generating) return
    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setGenerating(true)
    setGenerationError(null)
    setGenerationStep(null)
    void runSignalGeneration({
      projectId,
      prompt: trimmed,
      filters: filterSetOrNull(filters),
      signal: controller.signal,
      onStep: (next) => {
        if (!controller.signal.aborted) setGenerationStep(next)
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.status === "done") {
          handleGenerated({ signalId: result.signalId })
          return
        }
        if (result.status === "error") setGenerationError(result.error)
        setGenerating(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setGenerationError(toUserMessage(error))
        setGenerating(false)
      })
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
    const initialPayload: DetectorPayload =
      initial.detector.kind === "settings"
        ? { settings: initial.detector.settings }
        : { script: initial.detector.script }
    const detectorChanged = JSON.stringify(evaluation) !== JSON.stringify(initialPayload)
    const samplingChanged = sampling !== initial.sampling
    const filtersChanged = JSON.stringify(filterSetOrNull(filters)) !== JSON.stringify(initial.filters ?? null)
    if (!filtersChanged && !detectorChanged && !samplingChanged) {
      onClose()
      return
    }
    setIsSaving(true)
    try {
      if (filtersChanged) {
        await updateSignal.mutateAsync({ filters: filterSetOrNull(filters) })
      }
      if (detectorChanged || samplingChanged) {
        await updateSignalEvaluation.mutateAsync({ evaluation, sampling })
      }
      await invalidateSignalQueries(projectId, initial.signalId)
      toast({ description: "Signal updated." })
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsSaving(false)
    }
  }

  const view: StepId | EditTab = mode === "edit" ? editTab : step
  const isLastStep = stepIndex === CREATE_STEPS.length - 1
  const inConditionSubStep = view === "detector" && conditionEdit !== null

  // All three tabs are available in create and edit alike: an evaluation can be re-authored across kinds
  // (settings ⇄ raw script), and the update use-case persists whichever kind the user lands on.
  const detectorTabOptions = DETECTOR_TABS.map(({ id, title }) => ({ id, label: title }))

  const footer = inConditionSubStep ? (
    <>
      <Button variant="outline" onClick={() => openConditionEditor(null)}>
        Cancel
      </Button>
      <Button onClick={confirmCondition} disabled={draftCondition === null || !isConditionValid(draftCondition)}>
        {conditionEdit?.index === "new" ? "Add condition" : "Save condition"}
      </Button>
    </>
  ) : mode === "edit" ? (
    <>
      <Button variant="outline" disabled={isSaving} onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={() => void handleSaveEdit()} disabled={!detectorValid || isSaving} isLoading={isSaving}>
        Save changes
      </Button>
    </>
  ) : !methodChosen ? (
    <>
      <Button variant="link" disabled={generating} onClick={() => setMethodChosen(true)}>
        Configure manually
      </Button>
      <Button onClick={generate} disabled={generating || prompt.trim().length === 0} isLoading={generating}>
        Generate signal
      </Button>
    </>
  ) : (
    <>
      <Button
        variant="outline"
        disabled={isSaving}
        onClick={() => (stepIndex === 0 ? setMethodChosen(false) : goToStep(stepIndex - 1))}
      >
        Back
      </Button>
      {isLastStep ? (
        <Button onClick={() => void handleCreate()} disabled={isSaving} isLoading={isSaving}>
          Create signal
        </Button>
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
      dismissible={!generating}
      size="large"
      scrollable={false}
      footerAlign={mode === "create" && !methodChosen ? "justify" : "right"}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={mode === "create" ? "New signal" : "Edit signal"}
      description={
        !methodChosen ? undefined : mode === "create" ? (
          <StepIndicator
            steps={CREATE_STEPS.map((id) => ({ id, label: STEP_TITLE[id] }))}
            activeIndex={stepIndex}
            onStepClick={goToStep}
          />
        ) : (
          <Tabs<EditTab>
            variant="bordered"
            size="sm"
            options={EDIT_TAB_OPTIONS}
            active={editTab}
            onSelect={selectEditTab}
          />
        )
      }
      footer={footer}
    >
      {/* Fixed-height body so the modal does not resize between steps; content scrolls internally.
          `overflow-y-auto` also clips horizontally, so `-mx-2 px-2` (absorbed by the modal's px-6)
          gives focus rings and popover offsets a few px of clip headroom without insetting content. */}
      <div className="-mx-2 flex h-[min(60vh,36rem)] flex-col gap-4 overflow-y-auto px-2 pb-6">
        {!methodChosen ? (
          <DescribeSignalIntro
            prompt={prompt}
            onPromptChange={setPrompt}
            generating={generating}
            step={generationStep ?? stagedStep}
            error={generationError}
          />
        ) : null}

        {methodChosen && view === "detector" && !inConditionSubStep ? (
          <div className="flex flex-col gap-4">
            <StepHeading
              title="How should Latitude decide whether a session matches?"
              hint="This check runs automatically on every new session. When one passes, it joins the signal."
            />
            <div className="flex flex-col gap-1.5">
              <Tabs<DetectorTab>
                variant="bordered"
                size="sm"
                options={detectorTabOptions}
                active={tab}
                onSelect={selectDetectorTab}
              />
            </div>
            {tab === "rules" ? (
              <RuleConditionList draft={ruleDraft} onChange={setRuleDraft} onEditCondition={openConditionEditor} />
            ) : null}
            {tab === "llm" ? <JudgeDetectorEditor criteria={criteria} onCriteriaChange={setCriteria} /> : null}
            {tab === "advanced" ? (
              <AdvancedDetectorEditor
                compiled={compiledView}
                script={scriptDraft}
                placeholder={DEFAULT_ADVANCED_SCRIPT_PLACEHOLDER}
                onScriptChange={setScriptDraft}
                onDetach={detachToScript}
              />
            ) : null}
          </div>
        ) : null}

        {view === "detector" && inConditionSubStep ? (
          <ConditionEditor
            draftCondition={draftCondition}
            onDraftConditionChange={setDraftCondition}
            onClearType={() => setDraftCondition(null)}
            projectId={projectId}
            title={conditionEdit?.index === "new" ? "Add condition" : "Edit condition"}
            onBack={() => openConditionEditor(null)}
          />
        ) : null}

        {view === "scope" ? (
          <SignalScopeEditor
            projectId={projectId}
            value={filters}
            onChange={setFilters}
            sampling={sampling}
            onSamplingChange={setSampling}
            detectorKind={tab === "rules" ? "rule" : tab === "llm" ? "judge" : "script"}
          />
        ) : null}

        {view === "test" ? (
          <div className="flex flex-col gap-4">
            <StepHeading
              title="Try it on your real traffic"
              hint="We run your evaluation against recent sessions from this project. Nothing is saved. If the verdicts look off, go back and adjust."
            />
            <SignalPreviewStep
              result={previewResult}
              isRunning={previewRunning}
              onRun={runPreview}
              projectId={projectId}
            />
          </div>
        ) : null}

        {view === "details" ? (
          <div className="flex flex-col gap-4">
            <StepHeading
              title="Name your signal"
              hint="This shows up in the signals list, so pick a name your team will recognize."
            />
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
