import { useParamState } from "../../../../../../../../lib/hooks/useParamState.ts"
import { EMPTY_SPAN_FILTERS, type SpanFilters } from "./span-filters.ts"

export function useSpanFilters() {
  const [errors, setErrors] = useParamState("spanErrors", false)
  const [tools, setTools] = useParamState("spanTools", false)
  const [model, setModel] = useParamState("spanModel", "")

  const filters: SpanFilters = { errors, tools, model }

  function setFilters(next: SpanFilters) {
    setErrors(next.errors)
    setTools(next.tools)
    setModel(next.model)
  }

  function clearFilters() {
    setFilters(EMPTY_SPAN_FILTERS)
  }

  function openWithErrors() {
    setFilters({ ...EMPTY_SPAN_FILTERS, errors: true })
  }

  function openWithModel(nextModel: string) {
    setFilters({ ...EMPTY_SPAN_FILTERS, model: nextModel })
  }

  return {
    filters,
    setFilters,
    clearFilters,
    openWithErrors,
    openWithModel,
    toggleErrors: () => setErrors(!errors),
    toggleTools: () => setTools(!tools),
    selectModel: (nextModel: string) => setModel(nextModel),
  }
}
