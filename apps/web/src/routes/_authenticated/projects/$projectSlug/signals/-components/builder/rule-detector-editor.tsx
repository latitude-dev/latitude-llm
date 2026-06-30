import type { EvaluationRuleCondition } from "@domain/shared"
import { Button, Icon, Select, Tabs, Text } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react"
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
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
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
          <Text.H6 color="foregroundMuted">of the conditions match</Text.H6>
        </div>
      ) : null}
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
        <Button variant="outline" onClick={() => onEditCondition({ index: "new" })}>
          <Icon icon={PlusIcon} size="sm" />
          Add condition
        </Button>
      ) : (
        <Text.H6 color="foregroundMuted">Maximum of {MAX_CONDITIONS} conditions reached.</Text.H6>
      )}
    </div>
  )
}

/** The add/edit condition sub-step content (type picker + the type's settings). */
export function ConditionEditor({
  draftCondition,
  onDraftConditionChange,
}: {
  readonly draftCondition: EvaluationRuleCondition
  readonly onDraftConditionChange: (next: EvaluationRuleCondition) => void
}) {
  const meta = CONDITION_META[draftCondition.type] as ConditionTypeMeta
  const Editor = meta.Editor as ConditionTypeMeta["Editor"]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Select
          name="condition-type"
          label="Condition type"
          options={CONDITION_TYPE_ORDER.map((type) => ({ label: CONDITION_META[type].label, value: type }))}
          value={draftCondition.type}
          onChange={(type) => onDraftConditionChange(CONDITION_META[type].create())}
        />
        <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
      </div>
      <Editor condition={draftCondition} onChange={onDraftConditionChange} />
    </div>
  )
}
