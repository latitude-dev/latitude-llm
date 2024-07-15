import { Database } from '@latitude-data/core'

export * from './users'
export * from './projects'
export * from './commits'
export * from './documentSnapshots'
export * from './documentVersions'

export type AppContext = { db: Database }
