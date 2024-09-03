import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'

import EvaluationEditor from './_components/EvaluationEditor/Editor'

export default async function DocumentPage({
  params,
}: {
  params: { evaluationUuid: string }
}) {
  const evaluationUuid = params.evaluationUuid
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)

  return <EvaluationEditor evaluation={evaluation} />
}
