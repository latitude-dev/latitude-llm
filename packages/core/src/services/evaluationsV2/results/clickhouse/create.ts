import { insertRows } from '../../../../clickhouse/insert'
import { TypedResult } from '../../../../lib/Result'
import { EVALUATION_RESULTS_V2_TABLE } from '../../../../models/clickhouse/evaluationResultsV2'
import { buildEvaluationResultV2Row } from './buildRow'
import { EvaluationResultV2, EvaluationV2 } from '../../../../constants'
import { type Commit } from '../../../../schema/models/types/Commit'

/**
 * Creates an evaluation result row in ClickHouse.
 */
export async function createEvaluationResultV2InClickhouse({
  result,
  evaluation,
  commit,
}: {
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
}): Promise<TypedResult<undefined>> {
  const row = buildEvaluationResultV2Row({ result, evaluation, commit })
  return insertRows(EVALUATION_RESULTS_V2_TABLE, [row])
}
