import { DatasetColumnRole } from '@latitude-data/core/browser'
import { Text, Tooltip } from '@latitude-data/web-ui'

export function DatasetHeadText({
  text,
  role,
}: {
  text: string
  role: DatasetColumnRole
}) {
  if (role !== 'label') return <Text.H5>{text}</Text.H5>

  return (
    <Tooltip
      trigger={text}
      triggerBadge={{
        variant: 'accent',
        children: 'Label',
      }}
    >
      This column contains the expected output from the LLM response. Labels may
      be manually assigned or curated from production logs. Labels can help you
      evaluate an LLM based on ground-truth.
    </Tooltip>
  )
}
