import { spawnSync } from 'child_process'
import { env } from '@latitude-data/env'

function main() {
  const listResult = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  })

  if (listResult.status !== 0) {
    throw new Error('Failed to list Docker containers')
  }

  const containerName = listResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.includes('clickhouse'))

  if (!containerName) {
    throw new Error('No ClickHouse container found running')
  }

  const result = spawnSync(
    'docker',
    [
      'exec',
      '-it',
      containerName,
      'clickhouse-client',
      '--user',
      env.CLICKHOUSE_USER,
      '--password',
      env.CLICKHOUSE_PASSWORD,
      '--database',
      env.CLICKHOUSE_DB,
    ],
    { stdio: 'inherit' },
  )

  if (result.status === 0) return

  if (typeof result.status === 'number') {
    process.exit(result.status)
  }

  throw new Error('Failed to open ClickHouse client')
}

main()
