import { EMAIL_TRIGGER_DOMAIN } from '@latitude-data/constants'
import type { DocumentVersion } from '@latitude-data/core/browser'
import { type UseEmailTriggerConfiguration, EmailAvailabilityOptions } from './useConfiguration'

export function getEmailTriggerAddress(document: DocumentVersion) {
  return `${document.documentUuid}@${EMAIL_TRIGGER_DOMAIN}`
}

/**
 * If emailAvailability is public we set emailWhitelist and domainWhitelist to undefined
 * It's a weird api imo. But if you go to documentTriggers/handlers/emails/index.ts
 * you will see that's what's check to allow receiving email to hit this email trigger
 */
export function configureEmailAllowList({
  emailAvailability,
  emailWhitelist,
  domainWhitelist,
}: {
  emailAvailability: EmailAvailabilityOptions
  emailWhitelist: UseEmailTriggerConfiguration['emailWhitelist']
  domainWhitelist: UseEmailTriggerConfiguration['domainWhitelist']
}) {
  const isPrivate = emailAvailability === EmailAvailabilityOptions.Private

  return {
    emailWhitelist: isPrivate
      ? emailWhitelist.length > 0
        ? emailWhitelist
        : undefined
      : undefined,
    domainWhitelist: isPrivate
      ? domainWhitelist.length > 0
        ? domainWhitelist
        : undefined
      : undefined,
  }
}
