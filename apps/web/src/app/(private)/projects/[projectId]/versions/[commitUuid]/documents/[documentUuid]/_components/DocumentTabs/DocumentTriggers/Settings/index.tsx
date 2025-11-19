import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TabSelector } from '$/components/TabSelector'
import { useState } from 'react'
import { EmailTriggerSettings } from './EmailTrigger'
import { IntegrationTriggerSettings } from './IntegrationTriggers'
import { ScheduleTriggerSettings } from './ScheduleTrigger'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
enum ShareSettingsTabs {
  Email = 'email',
  Schedule = 'schedule',
  Integrations = 'integrations',
}

function TabLabel({ text, isActive }: { text: string; isActive: boolean }) {
  return (
    <div className='flex flex-row items-center gap-2'>
      <Text.H5>{text}</Text.H5>
      <DotIndicator variant={isActive ? 'success' : 'muted'} pulse={isActive} />
    </div>
  )
}

export function TriggerSettings({
  document,
  projectId,
  commitUuid,
  openTriggerModal,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
  openTriggerModal: (
    trigger?: DocumentTrigger<DocumentTriggerType.Integration>,
  ) => void
}) {
  const { data: triggers } = useDocumentTriggers({
    documentUuid: document.documentUuid,
    projectId,
    commitUuid,
  })

  const [selectedTab, setSelectedTab] = useState<ShareSettingsTabs>(
    ShareSettingsTabs.Integrations,
  )

  return (
    <div className='flex flex-col w-full gap-2 p-2'>
      <TabSelector
        options={[
          {
            value: ShareSettingsTabs.Integrations,
            label: (
              <TabLabel
                text='Integrations'
                isActive={triggers?.some(
                  (t) => t.triggerType === DocumentTriggerType.Integration,
                )}
              />
            ),
          },
          {
            value: ShareSettingsTabs.Email,
            label: (
              <TabLabel
                text='Email'
                isActive={triggers?.some(
                  (t) => t.triggerType === DocumentTriggerType.Email,
                )}
              />
            ),
          },
          {
            value: ShareSettingsTabs.Schedule,
            label: (
              <TabLabel
                text='Schedule'
                isActive={triggers?.some(
                  (t) => t.triggerType === DocumentTriggerType.Scheduled,
                )}
              />
            ),
          },
        ]}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      {selectedTab === ShareSettingsTabs.Email && (
        <EmailTriggerSettings
          document={document}
          projectId={projectId}
          commitUuid={commitUuid}
        />
      )}
      {selectedTab === ShareSettingsTabs.Schedule && (
        <ScheduleTriggerSettings
          document={document}
          projectId={projectId}
          commitUuid={commitUuid}
        />
      )}
      {selectedTab === ShareSettingsTabs.Integrations && (
        <IntegrationTriggerSettings
          document={document}
          projectId={projectId}
          commitUuid={commitUuid}
          openTriggerModal={openTriggerModal}
        />
      )}
    </div>
  )
}
