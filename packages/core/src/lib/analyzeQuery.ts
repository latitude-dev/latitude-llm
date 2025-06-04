import { sql } from 'drizzle-orm'
import { inspect } from 'node:util'
import { database } from '../client'

export default async function analyzeQuery(query: any, db = database) {
  console.log('\n======================================================\n')
  console.log(query.toSQL().sql)
  console.log()
  console.log(inspect(query.toSQL().params, { depth: null }))
  console.log('\n------------------------------------------------------\n')
  const result = await db.execute(sql`EXPLAIN ANALYZE ${query.getSQL()}`)
  for (const row of result.rows) console.log(row['QUERY PLAN'])
  console.log('\n======================================================\n')
}
