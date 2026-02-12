import { insertRows } from '../../../../clickhouse/insert'
import { TypedResult } from '../../../../lib/Result'
import {
  EVALUATION_RESULTS_TABLE,
  EvaluationResultV2Row,
} from '../../../../models/clickhouse/evaluationResults'
import { buildEvaluationResultRow } from './buildRow'
import { EvaluationResultV2, EvaluationV2 } from '../../../../constants'
import { type Commit } from '../../../../schema/models/types/Commit'

/**
 * Updates an evaluation result row in ClickHouse.
 */
export async function updateEvaluationResult({
  existingRow,
  result,
  evaluation,
  commit,
}: {
  existingRow: EvaluationResultV2Row
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
}): Promise<TypedResult<undefined>> {
  const row = buildEvaluationResultRow({
    result,
    evaluation,
    commit,
    existingRow,
  })
  return insertRows(EVALUATION_RESULTS_TABLE, [row])
}
