import { omit } from 'lodash-es'

import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm'

import { EvaluationDto } from '../browser'
import { EvaluationMetadataType } from '../constants'
import { NotFoundError, PromisedResult, Result } from '../lib'
import {
  connectedEvaluations,
  evaluations,
  llmAsJudgeEvaluationMetadatas,
} from '../schema'
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

export class EvaluationsRepository extends Repository<
  typeof tt,
  EvaluationDto
> {
  get scope() {
    return this.db
      .select(tt)
      .from(evaluations)
      .innerJoin(
        llmAsJudgeEvaluationMetadatas,
        and(
          eq(evaluations.metadataId, llmAsJudgeEvaluationMetadatas.id),
          eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudge),
        ),
      )
      .where(eq(evaluations.workspaceId, this.workspaceId))
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
      return Result.error(
        new NotFoundError(`Evaluation with UUID ${uuid} not found`),
      )
    }

    return Result.ok(result[0]!)
  }

  async findByDocumentUuid(documentUuid: string) {
    const result = await this.db
      .select({
        ...this.scope._.selectedFields,
        live: connectedEvaluations.live,
      })
      .from(this.scope)
      .innerJoin(
        connectedEvaluations,
        eq(connectedEvaluations.evaluationId, this.scope.id),
      )
      .where(eq(connectedEvaluations.documentUuid, documentUuid))

    return Result.ok(result as (EvaluationDto & { live: boolean })[])
  }

  async filterByUuids(uuids: string[]): PromisedResult<EvaluationDto[], Error> {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.uuid, uuids))

    return Result.ok(result)
  }

  async filterById(ids: number[]) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.id, ids))

    return Result.ok(result)
  }
}
