import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import { EmailTriggerSettings } from './EmailTrigger'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { ScheduleTriggerSettings } from './ScheduleTrigger'
import { IntegrationTriggerSettings } from './IntegrationTriggers'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

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
  openTriggerModal,
}: {
  document: DocumentVersion
  projectId: number
  openTriggerModal: (
    trigger?: Extract<
      DocumentTrigger,
      { triggerType: DocumentTriggerType.Integration }
    >,
  ) => void
}) {
  const { data: triggers } = useDocumentTriggers({
    documentUuid: document.documentUuid,
    projectId,
  })

  const { enabled: integrationTriggersEnabled } = useFeatureFlag({
    featureFlag: 'integrationTriggers',
  })

  const [selectedTab, setSelectedTab] = useState<ShareSettingsTabs>(
    integrationTriggersEnabled
      ? ShareSettingsTabs.Integrations
      : ShareSettingsTabs.Email,
  )

  return (
    <div className='flex flex-col w-full gap-2 p-2'>
      <TabSelector
        options={[
          ...(integrationTriggersEnabled
            ? [
                {
                  value: ShareSettingsTabs.Integrations,
                  label: (
                    <TabLabel
                      text='Integrations'
                      isActive={triggers?.some(
                        (t) =>
                          t.triggerType === DocumentTriggerType.Integration,
                      )}
                    />
                  ),
                },
              ]
            : []),
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
      {selectedTab === ShareSettingsTabs.Integrations && (
        <IntegrationTriggerSettings
          document={document}
          projectId={projectId}
          openTriggerModal={openTriggerModal}
        />
      )}
    </div>
  )
}
