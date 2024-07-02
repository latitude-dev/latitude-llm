import { listCommits } from '@latitude-data/database'
import database from '$/db/database'

export default async function Home() {
  const commits = await listCommits({ db: database })

  return (
    <div>
      <h1>List of commits</h1>
      <ul>
        {commits.map((c) => (
          <li key={c.uuid}>{c.title}</li>
        ))}
      </ul>
    </div>
  )
}
