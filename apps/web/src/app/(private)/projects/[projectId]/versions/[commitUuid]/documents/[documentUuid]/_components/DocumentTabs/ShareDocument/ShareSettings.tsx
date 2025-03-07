import { DocumentVersion } from '@latitude-data/core/browser'
import { TabSelector } from '@latitude-data/web-ui'
import { useState } from 'react'
import { PublishSettings } from './Settings/PublishedDocument'
import { EmailTriggerSettings } from './Settings/EmailTrigger'

enum ShareSettingsTabs {
  Publish = 'publish',
  Email = 'email',
}

export function ShareSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const [selectedTab, setSelectedTab] = useState<ShareSettingsTabs>(
    ShareSettingsTabs.Publish,
  )

  return (
    <div className='flex flex-col w-full gap-2 p-2'>
      <TabSelector
        options={[
          {
            label: 'Publish',
            value: ShareSettingsTabs.Publish,
          },
          {
            label: 'Email',
            value: ShareSettingsTabs.Email,
          },
        ]}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      {selectedTab === ShareSettingsTabs.Publish && (
        <PublishSettings document={document} projectId={projectId} />
      )}
      {selectedTab === ShareSettingsTabs.Email && (
        <EmailTriggerSettings document={document} projectId={projectId} />
      )}
    </div>
  )
}
