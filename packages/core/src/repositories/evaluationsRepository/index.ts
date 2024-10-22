import { omit } from 'lodash-es'

import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm'

import { EvaluationDto } from '../../browser'
import { EvaluationMetadataType } from '../../constants'
import { NotFoundError, Ok, PromisedResult, Result } from '../../lib'
import {
  connectedEvaluations,
  evaluationMetadataLlmAsJudgeCustom,
  evaluationMetadataLlmAsJudgeLegacy,
  evaluations,
} from '../../schema'
import { evaluationMetadataLlmAsJudgeBoolean } from '../../schema/models/evaluationMetadataLlmAsJudgeBoolean'
import { evaluationMetadataLlmAsJudgeNumerical } from '../../schema/models/evaluationMetadataLlmAsJudgeNumerical'
import { getSharedTableColumns } from '../../schema/schemaHelpers'
import Repository from '../repository'

const tt = {
  ...getTableColumns(evaluations),
  metadata: omit(
    getSharedTableColumns(
      evaluations.metadataType,
      {
        [EvaluationMetadataType.LlmAsJudgeLegacy]:
          evaluationMetadataLlmAsJudgeLegacy,
        [EvaluationMetadataType.LlmAsJudgeBoolean]:
          evaluationMetadataLlmAsJudgeBoolean,
        [EvaluationMetadataType.LlmAsJudgeNumerical]:
          evaluationMetadataLlmAsJudgeNumerical,
        [EvaluationMetadataType.LlmAsJudgeCustom]:
          evaluationMetadataLlmAsJudgeCustom,
      },
      'metadata_columns',
    ),
    ['id', 'createdAt', 'updatedAt'],
  ),
}

// const tt = {
//   ...getTableColumns(evaluations),
//   metadata: {
//     id: sql`
//       CASE
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeLegacy} THEN ${evaluationMetadataLlmAsJudgeLegacy.id}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeBoolean} THEN ${evaluationMetadataLlmAsJudgeBoolean.id}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeNumerical} THEN ${evaluationMetadataLlmAsJudgeNumerical.id}
//       END
//     `.as('id'),
//     prompt: evaluationMetadataLlmAsJudgeLegacy.prompt,
//     objective: sql`
//       CASE
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeBoolean} THEN ${evaluationMetadataLlmAsJudgeBoolean.objective}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeNumerical} THEN ${evaluationMetadataLlmAsJudgeNumerical.objective}
//       END
//     `.as('objective'),
//     ...
//   },
// }

export class EvaluationsRepository extends Repository<
  typeof tt,
  //@ts-expect-error – Drizzle doesn't think that the types do match
  EvaluationDto
> {
  get scope() {
    return this.db
      .select(tt)
      .from(evaluations)
      .leftJoin(
        evaluationMetadataLlmAsJudgeLegacy,
        and(
          eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudgeLegacy),
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeLegacy.id),
        ),
      )
      .leftJoin(
        evaluationMetadataLlmAsJudgeBoolean,
        and(
          eq(
            evaluations.metadataType,
            EvaluationMetadataType.LlmAsJudgeBoolean,
          ),
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeBoolean.id),
        ),
      )
      .leftJoin(
        evaluationMetadataLlmAsJudgeNumerical,
        and(
          eq(
            evaluations.metadataType,
            EvaluationMetadataType.LlmAsJudgeNumerical,
          ),
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeNumerical.id),
        ),
      )
      .leftJoin(
        evaluationMetadataLlmAsJudgeCustom,
        and(
          eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudgeCustom),
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeCustom.id),
        ),
      )
      .where(
        and(
          isNull(evaluations.deletedAt),
          eq(evaluations.workspaceId, this.workspaceId),
        ),
      )
      .as('evaluationsScope')
  }

  async findByName(name: string): PromisedResult<EvaluationDto, NotFoundError> {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok(result[0]! as EvaluationDto)
  }

  async findByUuid(uuid: string): PromisedResult<EvaluationDto, NotFoundError> {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))

    if (!result.length) {
      return Result.error(
        new NotFoundError(`Evaluation with UUID ${uuid} not found`),
      )
    }

    return Result.ok(result[0]! as EvaluationDto)
  }

  async findByDocumentUuid(
    documentUuid: string,
  ): Promise<Ok<(EvaluationDto & { live: boolean })[]>> {
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

  async filterByUuids(uuids: string[]): Promise<Ok<EvaluationDto[]>> {
    const result = (await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.uuid, uuids))) as EvaluationDto[]

    return Result.ok(result)
  }

  async filterById(ids: number[]): Promise<Ok<EvaluationDto[]>> {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.id, ids))

    return Result.ok(result as EvaluationDto[])
  }
}
