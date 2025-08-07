'use client'

import { FeaturesManager } from './_components'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export default function AdminFeatures() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Feature Toggles</Text.H1>
        <Text.H4 color='foregroundMuted'>
          Manage feature toggles for workspaces. Create new features and toggle
          them on/off for specific workspaces.
        </Text.H4>
        <FeaturesManager />
      </section>
    </div>
  )
}
