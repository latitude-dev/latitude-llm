'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { WeeklyEmailForm } from './_components/WeeklyEmailForm'

export default function AdminWeeklyEmail() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Weekly Email</Text.H1>
        <Text.H4 color='foregroundMuted'>
          Manually trigger weekly email reports for specific workspaces. You can
          optionally provide a comma-separated list of email addresses to send
          the report to instead of the workspace members.
        </Text.H4>
        <WeeklyEmailForm />
      </section>
    </div>
  )
}
