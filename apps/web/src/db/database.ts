import { buildDatabaseClient } from '@latitude-data/database'
import env from '$/env'

const testEnv = process.env.NODE_ENV === 'test'
const connectionString = testEnv ? env.TEST_DATABASE_URL : env.DATABASE_URL
export default buildDatabaseClient({ connectionString })
