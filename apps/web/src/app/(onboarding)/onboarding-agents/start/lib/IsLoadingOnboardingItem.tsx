import { Text } from '@latitude-data/web-ui/atoms/Text'

export function IsLoadingOnboardingItem({
  highlightedText,
  nonHighlightedText,
}: {
  highlightedText: string
  nonHighlightedText: string
}) {
  return (
    <Text.H5 centered color='foregroundMuted' animate>
      <Text.H5M color='foregroundMuted' animate>
        {highlightedText}
      </Text.H5M>{' '}
      {nonHighlightedText}
    </Text.H5>
  )
}
