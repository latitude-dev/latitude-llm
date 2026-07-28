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

/** Setting a field back to its baseline drops it, so the dirty count means "changes you would save". */
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
