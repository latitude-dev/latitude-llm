import { createUrlParamContext } from './useUrlParam'

const { Provider: SelectedTraceIdProvider, useValue } =
  createUrlParamContext('traceId')

export { SelectedTraceIdProvider }

export function useSelectedTraceId() {
  const { value, setValue } = useValue()
  return { selectedTraceId: value, setSelectedTraceId: setValue }
}
