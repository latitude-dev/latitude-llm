import { ReactNode, useMemo } from 'react'
import Image from 'next/image'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { humanizeCronValue } from '@latitude-data/web-ui/organisms/CronInput'
import {
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { ICONS_BY_TRIGGER } from '$/components/TriggersManagement/NewTrigger/IntegrationsList'
import { CLIENT_TIMEZONE, DEFAULT_TIMEZONE } from '$/lib/constants'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'

type ImageSize = 'small' | 'normal'
const IMAGE_SIZES: Record<ImageSize, number> = {
  small: 16,
  normal: 40,
}
const ICON_SIZES: Record<ImageSize, IconProps['size']> = {
  small: 'normal' as const,
  normal: 'large' as const,
}
export function useTriggerInfo({
  trigger,
  document,
  integrations,
  imageSize = 'normal',
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  integrations: IntegrationDto[]
  imageSize?: 'small' | 'normal'
}) {
  const imageDimension = IMAGE_SIZES[imageSize]
  const iconDimension = ICON_SIZES[imageSize]
  const integration = useMemo(() => {
    if (!integrations) return undefined
    if (trigger.triggerType !== DocumentTriggerType.Integration) {
      return undefined
    }

    const config = trigger.configuration as IntegrationTriggerConfiguration
    return integrations.find((i) => i.id === config.integrationId) as
      | PipedreamIntegration
      | undefined
  }, [integrations, trigger])

  const { data: app } = usePipedreamApp(integration?.configuration.appName)

  return useMemo<{
    title: string
    image: ReactNode
    description?: string
    integration?: PipedreamIntegration
  }>(() => {
    const iconName = ICONS_BY_TRIGGER[trigger.triggerType] || 'chat'
    const image = (
      <Icon name={iconName} size={iconDimension} color='foregroundMuted' />
    )

    if (trigger.triggerType === DocumentTriggerType.Scheduled) {
      const config = trigger.configuration as ScheduledTriggerConfiguration
      const humanCron = humanizeCronValue(config.cronExpression)
      const triggerTimezone = config.timezone ?? DEFAULT_TIMEZONE

      const prefix =
        triggerTimezone === CLIENT_TIMEZONE ? '' : `(${triggerTimezone}) `

      return {
        title: 'Schedule',
        description: prefix + humanCron,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Email) {
      const config = trigger.configuration as EmailTriggerConfiguration
      const emailAddress = `${document?.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`
      return {
        title: 'Email',
        description: config.name ?? emailAddress,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Chat) {
      return {
        title: 'Chat',
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Integration) {
      const config = trigger.configuration as IntegrationTriggerConfiguration
      const component = app?.triggers.find((c) => c.key === config.componentId)

      const integrationImage = integration?.configuration.metadata?.imageUrl ? (
        <Image
          src={integration.configuration.metadata.imageUrl}
          alt={integration.name}
          width={imageDimension}
          height={imageDimension}
          unoptimized
        />
      ) : (
        image
      )

      return {
        title: component?.name ?? config.componentId,
        integration,
        image: integrationImage,
      }
    }

    return {
      title: 'Unknown Trigger Type',
      image,
    }
  }, [trigger, document, app, integration, imageDimension, iconDimension])
}
