import { Alert, useCurrentCommit } from '@latitude-data/web-ui'

export function NotEditableBanner({ description }: { description: string }) {
  const { isHead } = useCurrentCommit()

  if (isHead) return null

  return <Alert variant='warning' description={description}></Alert>
}
