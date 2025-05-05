import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
const EVALUATION_PATH_REGEX =
  /evaluations-v2\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/

export function useSelectedEvaluationUuid() {
  const pathname = usePathname()
  const match = pathname.match(EVALUATION_PATH_REGEX)
  const currentEvaluationUuid = match ? match[1] : null
  return useMemo(() => ({ currentEvaluationUuid }), [currentEvaluationUuid])
}
export type UseEvaluationPathReturn = ReturnType<
  typeof useSelectedEvaluationUuid
>
