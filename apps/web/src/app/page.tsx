import { Commit, listCommits } from '@latitude-data/core'
import { exampleEnqueue } from '$/actions/example-enqueu'
import database from '$/db/database'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const commits = await listCommits({ db: database })

  return (
    <div>
      <h1>List of commits</h1>
      <form action={exampleEnqueue}>
        <button type='submit'>Enqueue example job</button>
      </form>
      <ul>
        {commits.map((c: Partial<Commit>) => (
          <li key={c.uuid}>{c.title}</li>
        ))}
      </ul>
    </div>
  )
}
