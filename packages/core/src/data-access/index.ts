import { Database } from '@latitude-data/core'

export * from './commits'
export * from './documentSnapshots'
export * from './documentVersions'
export * from './users'

export type AppContext = { db: Database }
