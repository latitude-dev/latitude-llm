import { useState } from "react"

interface UseDraftOverlay<Draft> {
  /** Baseline with the pending edits applied — what the form should render. */
  readonly view: Draft
  readonly setField: <K extends keyof Draft>(key: K, value: Draft[K]) => void
  readonly dirtyFields: readonly (keyof Draft)[]
  readonly dirtyCount: number
  readonly hasDirty: boolean
  readonly reset: () => void
}

/**
 * Overlay of pending edits on top of a live baseline, for a settings form whose
 * saved values keep arriving from a collection while the user types.
 *
 * Setting a field back to its baseline drops it from the overlay rather than
 * recording an equal-valued edit, so the dirty count means "changes you would
 * save" and not "fields you touched".
 */
export function useDraftOverlay<Draft extends object>(baseline: Draft): UseDraftOverlay<Draft> {
  const [pending, setPending] = useState<Partial<Draft>>({})

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setPending((prev) => {
      if (Object.is(value, baseline[key])) {
        const { [key]: _drop, ...rest } = prev
        return rest as Partial<Draft>
      }
      return { ...prev, [key]: value }
    })
  }

  const dirtyFields = (Object.keys(pending) as (keyof Draft)[]).filter((key) => !Object.is(pending[key], baseline[key]))

  return {
    view: { ...baseline, ...pending },
    setField,
    dirtyFields,
    dirtyCount: dirtyFields.length,
    hasDirty: dirtyFields.length > 0,
    reset: () => setPending({}),
  }
}
