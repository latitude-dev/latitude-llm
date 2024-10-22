import { omit } from 'lodash-es'

import {
  and,
  Column,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
  Table,
} from 'drizzle-orm'

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
import Repository from '../repository'

type ExtractedColumnsFromTables<Tables extends Record<string, Table>> = {
  [K in keyof Tables]: Tables[K]['_']['columns']
}[keyof Tables]

function getSharedTableColumns<
  C extends Column,
  ColumnType extends C['_']['dataType'] | string,
  Tables extends Record<ColumnType, Table>,
>({
  column,
  tables,
  aliasPrefix,
  omit,
}: {
  column: C
  tables: Record<ColumnType, Table>
  aliasPrefix?: string
  omit?: string[]
}): ExtractedColumnsFromTables<Tables> {
  const uniqueTablesColumns = Object.entries(tables).reduce(
    (acc, [dataType, table]) => {
      const tableColumns = getTableColumns(table as Table)

      Object.entries(tableColumns).forEach(([columnName, column]) => {
        if (omit?.includes(columnName)) return acc

        const value = {
          [dataType as ColumnType]: column,
        } as Record<ColumnType, Column>

        acc[columnName] = {
          ...acc[columnName],
          ...value,
        }
      })

      return acc
    },
    {} as Record<string, Record<ColumnType, Column>>,
  )

  return Object.entries(uniqueTablesColumns).reduce(
    (acc, [columnName, cases]) => {
      const alias = [aliasPrefix, columnName].filter(Boolean).join('_')

      const stringCases = sql.join(
        Object.entries(cases).map(([caseValue, caseColumn]) => {
          return sql`WHEN ${column} = ${caseValue} THEN ${caseColumn}`
        }),
        sql` `,
      )

      const columnSql =
        Object.values(cases).length == 1
          ? (Object.values(cases)[0]! as Column)
          : sql`CASE ${stringCases} END`.as(alias)

      return {
        ...acc,
        [columnName]: columnSql,
      }
    },
    {},
  ) as ExtractedColumnsFromTables<Tables>
}

const tt = {
  ...getTableColumns(evaluations),
  metadata: getSharedTableColumns({
    column: evaluations.metadataType,
    tables: {
      [EvaluationMetadataType.LlmAsJudgeLegacy]:
        evaluationMetadataLlmAsJudgeLegacy,
      [EvaluationMetadataType.LlmAsJudgeBoolean]:
        evaluationMetadataLlmAsJudgeBoolean,
      [EvaluationMetadataType.LlmAsJudgeNumerical]:
        evaluationMetadataLlmAsJudgeNumerical,
      [EvaluationMetadataType.LlmAsJudgeCustom]:
        evaluationMetadataLlmAsJudgeCustom,
    },
    aliasPrefix: 'metadata_columns',
  }),
}

// const tt = {
//   ...getTableColumns(evaluations),
//   metadata: {
//     id: sql`
//       CASE
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeLegacy} THEN ${evaluationMetadataLlmAsJudgeLegacy.id}::${evaluationMetadataLlmAsJudgeLegacy.id.dataType}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeBoolean} THEN ${evaluationMetadataLlmAsJudgeBoolean.id}::${evaluationMetadataLlmAsJudgeBoolean.id.dataType}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeNumerical} THEN ${evaluationMetadataLlmAsJudgeNumerical.id}::${evaluationMetadataLlmAsJudgeNumerical.id.dataType}
//       END
//     `.as('id'),
//     prompt: evaluationMetadataLlmAsJudgeLegacy.prompt,
//     objective: sql`
//       CASE
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeBoolean} THEN ${evaluationMetadataLlmAsJudgeBoolean.objective}::${evaluationMetadataLlmAsJudgeBoolean.objective.dataType}
//         WHEN ${evaluations.metadataType} = ${EvaluationMetadataType.LlmAsJudgeNumerical} THEN ${evaluationMetadataLlmAsJudgeNumerical.objective}::${evaluationMetadataLlmAsJudgeNumerical.objective.dataType}
//       END
//     `.as('objective'),
//   },
// }

export class EvaluationsRepository extends Repository<
  typeof tt,
  //@ts-expect-error – Drizzle doesn't think that the types do match
  EvaluationDto
> {
  get scope() {
    return this.db
      .select({
        ...getTableColumns(evaluations),
        metadata: {
          ...omit(getTableColumns(evaluationMetadataLlmAsJudgeLegacy), [
            'id',
            'createdAt',
            'updatedAt',
          ]),
        },
      })
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
