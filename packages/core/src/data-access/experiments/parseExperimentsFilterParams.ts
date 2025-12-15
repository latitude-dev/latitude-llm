import { parseISO } from 'date-fns'

export function parseSafeCreatedAtRange(
  createdAt: string[] | string | undefined,
) {
  const [rawFrom, rawTo] = createdAt?.toString()?.split(',') ?? []

  // URL encoding replaces '+' with ' ' so we need to replace it back
  const from = rawFrom?.replace(' ', '+')
  const to = rawTo?.replace(' ', '+')

  return {
    from: from ? parseISO(from) : undefined,
    to: to ? parseISO(to) : undefined,
  }
}

export function parseSafeCustomIdentifier(
  customIdentifier: string | string[] | undefined,
) {
  if (!customIdentifier) return undefined

  if (Array.isArray(customIdentifier) && customIdentifier.length) {
    customIdentifier = customIdentifier[0]
  }

  try {
    customIdentifier = decodeURIComponent(customIdentifier as string).trim()
  } catch (error) {
    return undefined
  }

  if (!customIdentifier) return undefined

  return customIdentifier
}

export function parseSafeExperimentId(
  experimentId: string | string[] | undefined,
) {
  if (!experimentId) return undefined

  if (Array.isArray(experimentId) && experimentId.length) {
    experimentId = experimentId[0]
  }

  try {
    experimentId = decodeURIComponent(experimentId as string).trim()
    const experimentIdNumber = Number(experimentId)
    if (!isNaN(experimentIdNumber)) {
      return experimentIdNumber
    }
  } catch (error) {
    // do nothing
  }

  return undefined
}
