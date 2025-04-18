import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export default function LabelIndicator() {
  return (
    <Tooltip trigger={<DotIndicator variant='success' />}>
      This column contains the expected output from the LLM response. Labels may
      be manually assigned or curated from production logs. Labels can help you
      evaluate an LLM based on ground-truth.
    </Tooltip>
  )
}
