import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

export function NotEditableBanner({ description }: { description: string }) {
  const { isHead } = useCurrentCommit()

  if (isHead) return null

  return <Alert variant='warning' description={description}></Alert>
}
