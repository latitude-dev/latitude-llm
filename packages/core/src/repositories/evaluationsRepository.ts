import { omit } from 'lodash-es'

import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm'

import { EvaluationDto } from '../browser'
import { EvaluationMetadataType, EvaluationResultableType } from '../constants'
import { NotFoundError, PromisedResult, Result } from '../lib'
import {
  connectedEvaluations,
  evaluationConfigurationBoolean,
  evaluationConfigurationNumerical,
  evaluationConfigurationText,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluations,
} from '../schema'
import { evaluationMetadataManual } from '../schema/models/evaluationMetadataDefault'
import { getSharedTableColumns } from '../schema/schemaHelpers'
import RepositoryLegacy from './repository'

const tt = {
  ...getTableColumns(evaluations),
  metadata: omit(
    getSharedTableColumns(evaluations.metadataType, {
      [EvaluationMetadataType.LlmAsJudgeAdvanced]:
        evaluationMetadataLlmAsJudgeAdvanced,
      [EvaluationMetadataType.LlmAsJudgeSimple]:
        evaluationMetadataLlmAsJudgeSimple,
      [EvaluationMetadataType.Manual]: evaluationMetadataManual,
    }),
    ['id', 'createdAt', 'updatedAt'],
  ),
  resultConfiguration: omit(
    getSharedTableColumns(evaluations.resultType, {
      [EvaluationResultableType.Boolean]: evaluationConfigurationBoolean,
      [EvaluationResultableType.Number]: evaluationConfigurationNumerical,
      [EvaluationResultableType.Text]: evaluationConfigurationText,
    }),
    ['id', 'createdAt', 'updatedAt'],
  ),
}

export class EvaluationsRepository extends RepositoryLegacy<
  typeof tt,
  EvaluationDto
> {
  get scope() {
    return this.db
      .select(tt)
      .from(evaluations)
      .leftJoin(
        evaluationMetadataLlmAsJudgeAdvanced,
        and(
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeAdvanced.id),
          eq(
            evaluations.metadataType,
            EvaluationMetadataType.LlmAsJudgeAdvanced,
          ),
        ),
      )
      .leftJoin(
        evaluationMetadataLlmAsJudgeSimple,
        and(
          eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeSimple.id),
          eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudgeSimple),
        ),
      )
      .leftJoin(
        evaluationMetadataManual,
        and(
          eq(evaluations.metadataId, evaluationMetadataManual.id),
          eq(evaluations.metadataType, EvaluationMetadataType.Manual),
        ),
      )
      .leftJoin(
        evaluationConfigurationBoolean,
        and(
          eq(
            evaluations.resultConfigurationId,
            evaluationConfigurationBoolean.id,
          ),
          eq(evaluations.resultType, EvaluationResultableType.Boolean),
        ),
      )
      .leftJoin(
        evaluationConfigurationNumerical,
        and(
          eq(
            evaluations.resultConfigurationId,
            evaluationConfigurationNumerical.id,
          ),
          eq(evaluations.resultType, EvaluationResultableType.Number),
        ),
      )
      .leftJoin(
        evaluationConfigurationText,
        and(
          eq(evaluations.resultConfigurationId, evaluationConfigurationText.id),
          eq(evaluations.resultType, EvaluationResultableType.Text),
        ),
      )
      .where(
        and(
          isNull(evaluations.deletedAt),
          eq(evaluations.workspaceId, this.workspaceId),
        ),
      )
      .as('evaluations_scope')
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok(result[0]! as EvaluationDto)
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

    return Result.ok(result[0]! as EvaluationDto)
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

    return Result.ok(result as EvaluationDto[])
  }

  async filterById(ids: number[]) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.id, ids))

    return Result.ok(result as EvaluationDto[])
  }
}
