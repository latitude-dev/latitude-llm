import { and, eq, getTableColumns } from 'drizzle-orm'

import type { LatteThread, LatteThreadCheckpoint } from '../browser'
import { Result } from '../lib/Result'
import type { PromisedResult } from '../lib/Transaction'
import { latteThreadCheckpoints, latteThreads } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(latteThreads)

export class LatteThreadsRepository extends Repository<LatteThread> {
  get scopeFilter() {
    return eq(latteThreads.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db.select(tt).from(latteThreads).where(this.scopeFilter).$dynamic()
  }

  async findByUuid({ threadUuid }: { threadUuid: string }): Promise<LatteThread | undefined> {
    const result = await this.db
      .select()
      .from(latteThreads)
      .where(and(this.scopeFilter, eq(latteThreads.uuid, threadUuid)))

    return result[0]
  }

  async findByUuidAndUser({
    threadUuid,
    userId,
  }: {
    threadUuid: string
    userId: string
  }): Promise<LatteThread | undefined> {
    const result = await this.db
      .select()
      .from(latteThreads)
      .where(
        and(this.scopeFilter, eq(latteThreads.userId, userId), eq(latteThreads.uuid, threadUuid)),
      )

    return result[0]
  }

  async findAllCheckpoints(threadUuid: string): PromisedResult<LatteThreadCheckpoint[]> {
    const result = await this.db
      .select(getTableColumns(latteThreadCheckpoints))
      .from(latteThreadCheckpoints)
      .leftJoin(latteThreads, eq(latteThreadCheckpoints.threadUuid, latteThreads.uuid))
      .where(and(this.scopeFilter, eq(latteThreads.uuid, threadUuid)))

    return Result.ok(result)
  }
}
