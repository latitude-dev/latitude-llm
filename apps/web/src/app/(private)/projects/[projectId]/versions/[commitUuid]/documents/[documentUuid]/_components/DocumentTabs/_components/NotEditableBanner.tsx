import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

export function NotEditableBanner({
  description,
  allowOnly,
}: {
  description: string
  allowOnly: 'live' | 'drafts'
}) {
  const { commit, isHead } = useCurrentCommit()

  if (allowOnly === 'live' && isHead) return null
  if (allowOnly === 'drafts' && !commit.mergedAt) return null

  return <Alert variant='warning' description={description}></Alert>
}
