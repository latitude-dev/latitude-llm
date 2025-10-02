import {
  SQL,
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  or,
  type InferSelectModel,
} from 'drizzle-orm'
import { Grant, GrantSource, Quota, QuotaType } from '../constants'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { grants } from '../schema/models/grants'
import Repository, { QueryOptions } from './repositoryV2'

const tt = getTableColumns(grants)

export class GrantsRepository extends Repository<Grant> {
  get scopeFilter() {
    return eq(grants.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(grants)
      .where(this.scopeFilter)
      .orderBy(desc(grants.createdAt), desc(grants.id))
      .$dynamic()
  }

  // Note: overwriting all Repository methods to return the correct type because it can't
  // be done automatically with the tt as Drizzle does not call mapWith on null values!!!
  private serialize(result: InferSelectModel<typeof grants>) {
    return { ...result, amount: result.amount ?? 'unlimited' } as Grant
  }

  async find(id: number) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(grants.id, id)))
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with id ${id} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<Grant>(this.serialize(result))
  }

  async findByUuid(uuid: string) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(grants.uuid, uuid)))
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with uuid ${uuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<Grant>(this.serialize(result))
  }

  async findAll(opts: QueryOptions = {}) {
    let query = this.scope

    if (opts.limit !== undefined) {
      query = this.scope.limit(opts.limit)
    }

    if (opts.offset !== undefined) {
      query = this.scope.offset(opts.offset)
    }

    const results = await query

    return Result.ok<Grant[]>(results.map(this.serialize))
  }

  async findMany(
    ids: number[],
    { ordering }: { ordering?: SQL<unknown>[] } = {},
  ) {
    const results = await this.scope
      .where(and(this.scopeFilter, inArray(grants.id, ids)))
      .orderBy(...(ordering ?? []))
      .limit(ids.length)

    return Result.ok<Grant[]>(results.map(this.serialize))
  }

  async findFirst() {
    const result = await this.scope.limit(1).then((r) => r[0])
    if (!result) {
      return Result.nil()
    }

    return Result.ok<Grant>(this.serialize(result))
  }

  async listReferenced(source: GrantSource, referenceId: string) {
    const results = await this.scope.where(
      and(
        this.scopeFilter,
        eq(grants.source, source),
        eq(grants.referenceId, referenceId),
      ),
    )

    return Result.ok<Grant[]>(results.map(this.serialize))
  }

  async listApplicable(since: Date, type?: QuotaType) {
    const results = await this.scope.where(
      and(
        this.scopeFilter,
        or(gte(grants.expiresAt, since), isNull(grants.expiresAt)),
        type ? eq(grants.type, type) : undefined,
      ),
    )

    return Result.ok<Grant[]>(results.map(this.serialize))
  }

  async quotaSinceDate(type: QuotaType, since: Date) {
    const listing = await this.listApplicable(since, type)
    if (listing.error) {
      return Result.error(listing.error as Error)
    }
    const grants = listing.value

    const unlimited = grants.some((grant) => grant.amount === 'unlimited')
    if (unlimited) {
      return Result.ok<Quota>('unlimited')
    }

    const quota = grants.reduce((acc, grant) => acc + grant.balance, 0)

    return Result.ok<Quota>(quota)
  }
}
