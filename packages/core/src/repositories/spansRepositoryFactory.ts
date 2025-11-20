import { env } from '@latitude-data/env'
import { PostgresSpansRepository } from './spansRepository'
import { ClickHouseSpansRepository } from './clickhouseSpansRepository'
import { database } from '../client'
import { ISpansRepository } from './interfaces/ISpansRepository'

export function SpansRepository(workspaceId: number, db = database): ISpansRepository {
    if (env.CLICKHOUSE_SPANS_READ) {
        return new ClickHouseSpansRepository(workspaceId)
    }

    return new PostgresSpansRepository(workspaceId, db)
}

// Re-export for type usage if needed, though interface is preferred
export { PostgresSpansRepository }
