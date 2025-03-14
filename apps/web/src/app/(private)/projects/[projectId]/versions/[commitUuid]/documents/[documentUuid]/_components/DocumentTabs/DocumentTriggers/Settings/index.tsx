import { DocumentVersion } from '@latitude-data/core/browser'
import { DotIndicator, TabSelector, Text } from '@latitude-data/web-ui'
import { useState } from 'react'
import { EmailTriggerSettings } from './EmailTrigger'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { ScheduleTriggerSettings } from './ScheduleTrigger'

enum ShareSettingsTabs {
  Email = 'email',
  Schedule = 'schedule',
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
}: {
  document: DocumentVersion
  projectId: number
}) {
  const { data: triggers } = useDocumentTriggers({
    documentUuid: document.documentUuid,
    projectId,
  })

  const [selectedTab, setSelectedTab] = useState<ShareSettingsTabs>(
    ShareSettingsTabs.Email,
  )

  return (
    <div className='flex flex-col w-full gap-2 p-2'>
      <TabSelector
        options={[
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
        <EmailTriggerSettings document={document} projectId={projectId} />
      )}
      {selectedTab === ShareSettingsTabs.Schedule && (
        <ScheduleTriggerSettings document={document} projectId={projectId} />
      )}
    </div>
  )
}
