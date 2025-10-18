import { QueryResult } from 'pg'

export default function rowsFromQueryPlan(
  plan: QueryResult<Record<string, unknown>>,
) {
  try {
    return plan.rows.reduce((max, row) => {
      const plan = row['QUERY PLAN'] as string
      const matches = plan.match(/rows=(\d+)/g)

      let count = 0
      if (matches) {
        count = Math.max(
          ...matches.map((match) => parseInt(match.replace('rows=', ''), 10)),
        )
      }

      return Math.max(max, count)
    }, 0)
  } catch (_error) {
    return 0
  }
}
