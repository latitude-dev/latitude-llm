import type { ThinkToolArgs } from '@latitude-data/core/services/latitudeTools/think/types'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { ToolContent } from '@latitude-data/constants/legacyCompiler'
import { Text } from '@latitude-data/web-ui/atoms/Text'

function uppercaseFirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function ThinkLatitudeToolCallContent({
  toolCallId,
  args,
}: {
  toolCallId: string
  args: ThinkToolArgs
  toolResponse?: ToolContent
}) {
  return (
    <ContentCard
      label={uppercaseFirst(args.action)}
      icon='brain'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <ContentCardContainer>
        <Text.H5 color='foregroundMuted'>{args.thought}</Text.H5>
      </ContentCardContainer>
    </ContentCard>
  )
}
