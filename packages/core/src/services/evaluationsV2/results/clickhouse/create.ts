import { insertRows } from '../../../../clickhouse/insert'
import { TypedResult } from '../../../../lib/Result'
import { TABLE_NAME } from '../../../../schema/models/clickhouse/evaluationResults'
import { buildEvaluationResultRow } from './buildRow'
import { EvaluationResultV2, EvaluationV2 } from '../../../../constants'
import { type Commit } from '../../../../schema/models/types/Commit'

/**
 * Creates an evaluation result row in ClickHouse.
 */
export async function createEvaluationResult({
  result,
  evaluation,
  commit,
}: {
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
}): Promise<TypedResult<undefined>> {
  const row = buildEvaluationResultRow({ result, evaluation, commit })
  return insertRows(TABLE_NAME, [row])
}
