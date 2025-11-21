import { env } from '@latitude-data/env'
import { Link, Section, Text } from '@react-email/components'
import ContainerLayout, { ContainerLayoutProps } from '../ContainerLayout'

export type NotificiationsLayoutProps = Omit<ContainerLayoutProps, 'footer'> & {
  currentUser: { memberId: string; userId: string; email: string }
}

export default function ContainerLayoutWithNotificationSettings({
  children,
  title,
  previewText,
  footerText = 'The Latitude Team',
  currentUser: { memberId },
}: NotificiationsLayoutProps) {
  const rootUrl = env.APP_URL
  const notificationSettingsUrl = `${rootUrl}/dashboard/notifications/${memberId}`

  return (
    <ContainerLayout
      title={title}
      previewText={previewText}
      footerText={footerText}
      footer={
        <Section className='pt-4 border-t border-gray-200 mt-4'>
          <Text className='text-gray-400 text-xs'>
            You are receiving this email because you are subscribed to
            notifications for this workspace.{' '}
            <Link
              href={notificationSettingsUrl}
              className='text-gray-500 underline'
            >
              Update your notification preferences
            </Link>
          </Text>
        </Section>
      }
    >
      {children}
    </ContainerLayout>
  )
}
