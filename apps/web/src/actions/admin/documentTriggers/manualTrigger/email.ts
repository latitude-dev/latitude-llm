'use server'

import { z } from 'zod'

import { withAdmin } from '../../../procedures'

/**
 * FIXME: Uncomment when we fix the issue with the mailer.
 * Importing this breaks Next.js build.
 *
 * It's importing code from our mailers which use this package:
 * https://www.npmjs.com/package/nodemailer-mailgun-transport
 *
 * Which is unmaintained and has a dependency on an old version of `babel-core`. which
 * (I Think) is what's causing the build to fail.
 *
 * If I comment that part the build works.
 */
/* import { registerEmailTriggerEvent } from '@latitude-data/core/services/documentTriggers/handlers/email/registerEvent' */

export const manualEmailTriggerAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      recipient: z.string().email(),
      senderEmail: z.string().email(),
      senderName: z.string(),
      subject: z.string(),
      body: z.string(),
      messageId: z.string().optional(),
      references: z.string().optional(),
      files: z.array(z.instanceof(File)).optional(),
    }),
  )
  .handler(async ({ input: _in }) => {
    /* registerEmailTriggerEvent({ */
    /*   recipient: input.recipient, */
    /*   subject: input.subject, */
    /*   body: input.body, */
    /*   senderEmail: input.senderEmail, */
    /*   senderName: input.senderName, */
    /*   messageId: input.messageId?.length ? input.messageId : undefined, */
    /*   parentMessageIds: input.references?.length */
    /*     ? input.references.split(' ') */
    /*     : undefined, */
    /*   attachments: input.files, */
    /* }) */

    return {}
  })
