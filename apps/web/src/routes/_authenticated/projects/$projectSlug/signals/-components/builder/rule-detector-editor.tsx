import type { EvaluationRuleCondition } from "@domain/shared"
import { Button, Icon, Tabs, Text } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react"
import { CONDITION_META, CONDITION_TYPE_ORDER, type ConditionTypeMeta, summarizeCondition } from "./condition-meta.tsx"

const MAX_CONDITIONS = 10

export interface RuleDraft {
  readonly match: "all" | "any"
  readonly conditions: readonly EvaluationRuleCondition[]
}

export type ConditionEditState = { readonly index: number | "new" } | null

function ConditionRow({
  condition,
  index,
  total,
  onEdit,
  onRemove,
  onMove,
}: {
  readonly condition: EvaluationRuleCondition
  readonly index: number
  readonly total: number
  readonly onEdit: () => void
  readonly onRemove: () => void
  readonly onMove: (direction: -1 | 1) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H6 color="foregroundMuted">{CONDITION_META[condition.type].label}</Text.H6>
        <Text.H5 ellipsis noWrap>
          {summarizeCondition(condition)}
        </Text.H5>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Move condition up"
        >
          <Icon icon={ArrowUpIcon} size="sm" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label="Move condition down"
        >
          <Icon icon={ArrowDownIcon} size="sm" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit condition">
          <Icon icon={PencilIcon} size="sm" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove condition">
          <Icon icon={XIcon} size="sm" />
        </Button>
      </div>
    </div>
  )
}

/** The conditions list — shown when no condition sub-step is open. */
export function RuleConditionList({
  draft,
  onChange,
  onEditCondition,
}: {
  readonly draft: RuleDraft
  readonly onChange: (next: RuleDraft) => void
  readonly onEditCondition: (state: ConditionEditState) => void
}) {
  const { conditions, match } = draft

  const removeAt = (index: number) => onChange({ ...draft, conditions: conditions.filter((_, i) => i !== index) })

  const moveAt = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= conditions.length) return
    const next = [...conditions]
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    onChange({ ...draft, conditions: next })
  }

  return (
    <div className="flex flex-col gap-3">
      {conditions.length >= 2 ? (
        <div className="flex items-center gap-2">
          <Text.H6 color="foregroundMuted">Match</Text.H6>
          <Tabs
            variant="bordered"
            size="sm"
            options={[
              { id: "all", label: "All" },
              { id: "any", label: "Any" },
            ]}
            active={match}
            onSelect={(value) => onChange({ ...draft, match: value })}
          />
          <Text.H6 color="foregroundMuted">of the conditions</Text.H6>
        </div>
      ) : null}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {conditions.map((condition, index) => (
          <ConditionRow
            key={index}
            condition={condition}
            index={index}
            total={conditions.length}
            onEdit={() => onEditCondition({ index })}
            onRemove={() => removeAt(index)}
            onMove={(direction) => moveAt(index, direction)}
          />
        ))}
        {conditions.length < MAX_CONDITIONS ? (
          <button
            type="button"
            onClick={() => onEditCondition({ index: "new" })}
            className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-left hover:bg-muted"
          >
            <Icon icon={PlusIcon} size="sm" color="foregroundMuted" />
            <Text.H5 color="foregroundMuted">Add condition</Text.H5>
          </button>
        ) : (
          <div className="px-3 py-2.5">
            <Text.H6 color="foregroundMuted">Maximum of {MAX_CONDITIONS} conditions reached.</Text.H6>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The add/edit condition sub-step, single-purpose at each phase: when no type is
 * chosen it shows only the type list; once a type is chosen it shows only that
 * type's settings, with the type as the header and a "Change type" affordance.
 */
export function ConditionEditor({
  draftCondition,
  onDraftConditionChange,
  onClearType,
  title,
  onBack,
}: {
  readonly draftCondition: EvaluationRuleCondition | null
  readonly onDraftConditionChange: (next: EvaluationRuleCondition) => void
  readonly onClearType: () => void
  readonly title: string
  readonly onBack: () => void
}) {
  // Phase A — pick a type (nothing else on screen).
  if (draftCondition === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conditions">
            <Icon icon={ChevronLeftIcon} size="sm" />
          </Button>
          <Text.H5M>{title}</Text.H5M>
        </div>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {CONDITION_TYPE_ORDER.map((type) => {
            const meta = CONDITION_META[type]
            return (
              <button
                key={type}
                type="button"
                onClick={() => onDraftConditionChange(meta.create())}
                className="flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted"
              >
                <Text.H5>{meta.label}</Text.H5>
                <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Phase B — configure the chosen type (only its settings).
  const meta = CONDITION_META[draftCondition.type]
  const Editor = meta.Editor as ConditionTypeMeta["Editor"]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conditions">
            <Icon icon={ChevronLeftIcon} size="sm" />
          </Button>
          <Text.H5M ellipsis noWrap>
            {meta.label}
          </Text.H5M>
        </div>
        <Button variant="link" size="sm" onClick={onClearType}>
          Change type
        </Button>
      </div>
      <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
      <Editor condition={draftCondition} onChange={onDraftConditionChange} />
    </div>
  )
}
