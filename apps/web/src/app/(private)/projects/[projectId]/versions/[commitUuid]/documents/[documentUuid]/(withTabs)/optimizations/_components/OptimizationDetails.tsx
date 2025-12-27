import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useState } from 'react'

export function OptimizationDetails({
  optimization,
}: {
  optimization: Optimization
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [expanded, setExpanded] = useState(true)

  // TODO(AO/OPT): Implement
  return (
    <form className='min-w-0' id='optimizationDetails'>
      <FormWrapper>
        TODO(AO/OPT): Simple configuration
        <CollapsibleBox
          title='Advanced configuration'
          icon='settings'
          isExpanded={expanded}
          onToggle={setExpanded}
          scrollable={false}
          expandedContent={
            <FormWrapper>TODO(AO/OPT): Advanced configuration</FormWrapper>
          }
        />
      </FormWrapper>
    </form>
  )
}
