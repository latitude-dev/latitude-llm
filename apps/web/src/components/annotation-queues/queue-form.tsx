import { LIVE_QUEUE_DEFAULT_SAMPLING } from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { CheckboxInput, Input, Slider, Text, Textarea } from "@repo/ui"
import type { ReactNode, RefObject } from "react"
import { Activity } from "react"
import { withForm } from "../../lib/form-hook-factory.ts"
import { FilterBuilder } from "../filters-builder/filter-builder.tsx"
import { UserMultiSelect } from "../user-multi-select.tsx"
import type { QueueFormValues } from "./queue-form-schema.ts"

function SamplingSlider({
  value,
  onChange,
  description,
}: {
  value: number
  onChange: (value: number) => void
  description: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Text.H5>Sampling</Text.H5>
        <Text.H5 color="foregroundMuted">{value}%</Text.H5>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v ?? LIVE_QUEUE_DEFAULT_SAMPLING)}
        min={0}
        max={100}
        step={1}
      />
      <Text.H6 color="foregroundMuted">{description}</Text.H6>
    </div>
  )
}

export const QueueForm = withForm({
  defaultValues: {
    name: "",
    description: "",
    instructions: "",
    assignees: [] as string[],
    isLive: false as boolean,
    filters: {} as FilterSet,
    sampling: LIVE_QUEUE_DEFAULT_SAMPLING,
  } satisfies QueueFormValues,
  props: {} as {
    projectId: string
    disabled?: boolean
    showLiveSettings?: boolean
    initialFilters?: FilterSet
    portalContainer?: RefObject<HTMLElement | null>
  },
  render: function QueueFormRender({
    form,
    projectId,
    disabled = false,
    showLiveSettings = true,
    initialFilters,
    portalContainer,
  }) {
    return (
      <div className="flex flex-col gap-6">
        <form.Field name="name">
          {(field) => (
            <Input
              label={field.name}
              placeholder="My annotation queue"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              disabled={disabled}
              required
              errors={field.state.meta.errors.length > 0 ? field.state.meta.errors.map(String) : undefined}
            />
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Input
              name={field.name}
              label="Description"
              placeholder="Short description of this queue"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={disabled}
              errors={field.state.meta.errors.length > 0 ? field.state.meta.errors.map(String) : undefined}
            />
          )}
        </form.Field>

        <form.Field name="instructions">
          {(field) => (
            <Textarea
              name={field.name}
              label="Instructions"
              description="Instructions help annotators understand what to look for when reviewing traces in this queue."
              placeholder="Guidance for annotators reviewing traces in this queue..."
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={disabled}
              minRows={3}
              errors={field.state.meta.errors.length > 0 ? field.state.meta.errors.map(String) : undefined}
            />
          )}
        </form.Field>

        <form.Field name="assignees">
          {(field) => (
            <UserMultiSelect
              label="Assignees"
              value={field.state.value}
              onChange={field.handleChange}
              placeholder="Select team members..."
              {...(portalContainer ? { portalContainer } : {})}
            />
          )}
        </form.Field>

        {showLiveSettings && (
          <div className="flex flex-col gap-4">
            <form.Field name="isLive">
              {(field) => (
                <CheckboxInput
                  name={field.name}
                  checked={field.state.value}
                  label="Make this queue live"
                  description="Process new traces automatically based on filters"
                  onCheckedChange={(checked) => {
                    field.handleChange(checked === true)
                    if (checked && initialFilters && Object.keys(initialFilters).length > 0) {
                      form.setFieldValue("filters", initialFilters)
                    }
                  }}
                />
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.isLive}>
              {(isLive) => (
                <Activity mode={isLive ? "visible" : "hidden"}>
                  <form.Field name="sampling">
                    {(field) => (
                      <SamplingSlider
                        value={field.state.value}
                        onChange={field.handleChange}
                        description="Percentage of matching traces to include in this queue."
                      />
                    )}
                  </form.Field>

                  <form.Field name="filters">
                    {(field) => (
                      <div className="flex flex-col gap-2 rounded-md border p-4">
                        <Text.H5>Filters</Text.H5>
                        <Text.H6 color="foregroundMuted">
                          Traces matching these filters will be automatically added to this queue.
                        </Text.H6>
                        <div className="pt-2">
                          <FilterBuilder
                            projectId={projectId}
                            value={field.state.value}
                            onChange={field.handleChange}
                            emptyMessage="No filters configured. Add filters to make this a live queue."
                            {...(portalContainer ? { portalContainer } : {})}
                          />
                        </div>
                      </div>
                    )}
                  </form.Field>
                </Activity>
              )}
            </form.Subscribe>
          </div>
        )}
      </div>
    )
  },
})
