import * as Sentry from '@sentry/nextjs'
import env from '$/env'

export const captureException = (error: Error) => {
  if (env.NODE_ENV === 'production') {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.NODE_ENV === 'production') {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
