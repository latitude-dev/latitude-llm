'use server'

import { env } from '@latitude-data/env'
import { validateInvitation } from '@latitude-data/core/services/invitations/validateInvitation'
import { useInvitation } from '@latitude-data/core/services/invitations/useInvitation'
import { unsafelyFindUserByEmail } from '@latitude-data/core/data-access'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import setupService from '$/services/user/setupService'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errorHandlingProcedure } from '../procedures'

export const setupAction = errorHandlingProcedure
  .createServerAction()
  .input(
    async () => {
      return z.object({
        returnTo: z.string().optional(),
        name: z.string().min(1, { message: 'Name is a required field' }),
        email: z // This email validation needs to be conditional if invite_only and token is present
          .string()
          .email()
          .refine(
            async (email) => {
              const existingUser = await unsafelyFindUserByEmail(email)
              return !existingUser
            },
            { message: 'Email is already in use' },
          )
          .refine(
            async (email) =>
              !email.match(/^[A-Z0-9_!#$%&'*+/=?`{|}~^.-]+@[A-Z0-9.-]+$/) &&
              !email.match(/^[^+]+\+\d+@[A-Z0-9.-]+$/i),
            { message: 'Email is not valid' },
          ),
        companyName: z
          .string()
          .min(1, { message: 'Workspace name is a required field' }),
        invitationToken: z.string().optional(),
      })
    },
    { type: 'formData' },
  )
  .handler(async ({ input }) => {
    let validatedInvitationEmail: string | undefined = undefined

    if (env.INVITE_ONLY) {
      if (!input.invitationToken) {
        throw new Error('An invitation token is required to sign up.')
      }
      const validationResult = await validateInvitation({
        token: input.invitationToken,
      })
      if (!validationResult.ok) {
        const message = validationResult.error?.message || 'Invalid or expired invitation token.'
        throw new Error(message)
      }
      validatedInvitationEmail = validationResult.unwrap().email
      // This check must be within the INVITE_ONLY block
      if (input.email.toLowerCase() !== validatedInvitationEmail.toLowerCase()) {
        throw new Error('The email provided does not match the invited email address.')
      }
    }

    // If INVITE_ONLY is true, the email uniqueness check in Zod schema might be problematic
    // because the user doesn't exist yet. We rely on the invitation.
    // The existing refine for email uniqueness might need adjustment or conditional logic
    // if it runs before we can confirm the user is invited.
    // For now, proceeding with assumption that Zod schema is processed first.
    // If `validatedInvitationEmail` is set, we've already confirmed the invite.

    const result = await setupService({
      name: input.name,
      email: input.email, // Use the input email, already validated against token if applicable
      companyName: input.companyName,
    })
    const { workspace, user } = result.unwrap()

    if (env.INVITE_ONLY && input.invitationToken) {
      // Token was validated, now mark it as used
      const useResult = await useInvitation({ token: input.invitationToken })
      if (!useResult.ok) {
        // This is a critical issue: user created but token not marked.
        // Log this error for investigation. For user, proceed with login,
        // but this needs monitoring.
        const errorMessage = useResult.error?.message || 'Unknown error marking token as used.'
        console.error(
          `CRITICAL: User ${user.id} created via invitation token ${input.invitationToken}, but failed to mark token as used: ${errorMessage}`,
        )
      }
    }

    await setSession({
      sessionData: {
        user,
        workspace,
      },
    })

    redirect(input.returnTo ? input.returnTo : ROUTES.root)
  })
