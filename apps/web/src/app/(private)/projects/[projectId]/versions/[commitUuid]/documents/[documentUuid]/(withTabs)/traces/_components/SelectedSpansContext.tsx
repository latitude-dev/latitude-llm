import { createUrlParamContext } from './useUrlParam'

const { Provider: SelectedSpansProvider, useValue } =
  createUrlParamContext('spanId')

export { SelectedSpansProvider }

export function useSelectedSpan() {
  const { value, setValue } = useValue()
  return { selectedSpanId: value, setSelectedSpanId: setValue }
}
