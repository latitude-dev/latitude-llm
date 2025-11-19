import { ReactNode, useMemo } from 'react'
import { IconProps } from '@latitude-data/web-ui/atoms/Icons'
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
import { CLIENT_TIMEZONE, DEFAULT_TIMEZONE } from '$/lib/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { useTriggerIcon } from './useTriggerIcon'
import { useTriggerLabel } from './useTriggerLabel'

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
  document?: DocumentVersion
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

  // Use the new useTriggerIcon hook for consistent icon rendering
  const image = useTriggerIcon({
    trigger,
    integrations,
    size: imageDimension,
    iconSize: iconDimension,
  })

  // Use the new useTriggerLabel hook for consistent label rendering
  const title = useTriggerLabel({
    trigger,
    integrations,
  })

  return useMemo<{
    title: string
    image: ReactNode
    description?: string
    integration?: PipedreamIntegration
  }>(() => {
    if (trigger.triggerType === DocumentTriggerType.Scheduled) {
      const config = trigger.configuration as ScheduledTriggerConfiguration
      const humanCron = humanizeCronValue(config.cronExpression)
      const triggerTimezone = config.timezone ?? DEFAULT_TIMEZONE

      const prefix =
        triggerTimezone === CLIENT_TIMEZONE ? '' : `(${triggerTimezone}) `

      return {
        title,
        description: prefix + humanCron,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Email) {
      const config = trigger.configuration as EmailTriggerConfiguration
      const emailAddress = document
        ? `${document.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`
        : ''
      return {
        title,
        description: config.name ?? emailAddress,
        image,
      }
    }

    if (trigger.triggerType === DocumentTriggerType.Integration) {
      return {
        title,
        integration,
        image,
      }
    }

    return {
      title,
      image,
    }
  }, [trigger, document, title, integration, image])
}
