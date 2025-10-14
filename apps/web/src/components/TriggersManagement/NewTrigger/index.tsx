import { useState } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { IntegrationsList } from './IntegrationsList'
import { PipedreamTrigger } from './TriggerTypes/PipedreamTrigger'
import { ScheduleTrigger } from './TriggerTypes/ScheduleTrigger'
import { EmailTrigger } from './TriggerTypes/EmailTrigger'
import { OnTriggerCreated, SelectedIntegration } from '../types'
import { DocumentVersion } from '@latitude-data/core/schema/types'

function IntegrationDetail({
  selectedIntegration,
  onTriggerCreated,
  document,
}: {
  onTriggerCreated: OnTriggerCreated
  selectedIntegration?: SelectedIntegration | null
  document?: DocumentVersion
}) {
  // NOTE: If initial document is provided, we skip the "select document" step
  // Also we create the trigger in the current document
  if (!selectedIntegration) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Text.H5>Select an integration</Text.H5>
      </div>
    )
  }
  const slug = selectedIntegration.slug

  if (selectedIntegration.type === DocumentTriggerType.Email) {
    return (
      <EmailTrigger onTriggerCreated={onTriggerCreated} document={document} />
    )
  }

  if (selectedIntegration.type === DocumentTriggerType.Scheduled) {
    return (
      <ScheduleTrigger
        onTriggerCreated={onTriggerCreated}
        document={document}
      />
    )
  }

  return (
    <PipedreamTrigger
      key={slug}
      pipedreamSlug={slug}
      onTriggerCreated={onTriggerCreated}
      document={document}
    />
  )
}
export function NewTrigger({
  onTriggerCreated,
  document,
}: {
  onTriggerCreated: OnTriggerCreated
  document?: DocumentVersion
}) {
  const [selected, setSelected] = useState<SelectedIntegration | null>(null)
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 w-full h-full min-h-0 pb-6'>
      <IntegrationsList onSelectIntegration={setSelected} />
      <div className='border border-border rounded-lg min-h-0 bg-secondary overflow-auto custom-scrollbar'>
        <IntegrationDetail
          selectedIntegration={selected}
          onTriggerCreated={onTriggerCreated}
          document={document}
        />
      </div>
    </div>
  )
}
