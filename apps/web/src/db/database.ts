import { buildDatabaseClient } from '@latitude-data/core'
import env from '$/env'

const connectionString = env.DATABASE_URL
const database = buildDatabaseClient({ connectionString })
export default database
