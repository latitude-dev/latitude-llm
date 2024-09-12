import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'

export default async function EvaluationPage({
  params: { evaluationUuid },
}: {
  params: { evaluationUuid: string }
}) {
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)
  return (
    <div>
      <h1>{evaluation.name}</h1>
      <p>{evaluation.description || 'No description for this evaluation'}</p>
    </div>
  )
}
