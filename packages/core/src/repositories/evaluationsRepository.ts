import { omit } from 'lodash-es'

import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { EvaluationMetadataType } from '../constants'
import { NotFoundError, Result } from '../lib'
import { evaluations, llmAsJudgeEvaluationMetadatas } from '../schema'
import Repository from './repository'

const tt = {
  ...getTableColumns(evaluations),
  metadata: {
    id: sql<number>`llm_as_judge_evaluation_metadatas.id`.as(
      'metadata_metadata_id',
    ),
    ...omit(getTableColumns(llmAsJudgeEvaluationMetadatas), [
      'id',
      'metadataType',
      'createdAt',
      'updatedAt',
    ]),
  },
}

export class EvaluationsRepository extends Repository<typeof tt> {
  get scope() {
    return this.db
      .select(tt)
      .from(evaluations)
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .innerJoin(
        llmAsJudgeEvaluationMetadatas,
        and(
          eq(evaluations.metadataId, llmAsJudgeEvaluationMetadatas.id),
          eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudge),
        ),
      )
      .as('evaluationsScope')
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok(result[0]!)
  }

  async findByUuid(uuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))

    if (!result.length) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok(result[0]!)
  }
}
