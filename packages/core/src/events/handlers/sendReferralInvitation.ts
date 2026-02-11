import { unsafelyFindUserByEmail } from '../../queries/users/findByEmail'
import { unsafelyFindUserById } from '../../queries/users/findById'
import { ReferralMailer } from '../../mailer/mailers/invitations/ReferralMailer'
import { SendReferralInvitationEvent } from '../events'
import { NotFoundError } from '@latitude-data/constants/errors'

export const sendReferralInvitationJob = async ({
  data: event,
}: {
  data: SendReferralInvitationEvent
}) => {
  const invitee = await unsafelyFindUserById({ id: event.data.userId })
  if (!invitee) throw new NotFoundError('Invitee user not found')

  const invited = await unsafelyFindUserByEmail({ email: event.data.email })
  if (invited) return // Should never happen

  const mailer = new ReferralMailer(
    {
      to: event.data.email,
    },
    {
      email: event.data.email,
      invitee,
    },
  )

  await mailer.send().then((r) => r.unwrap())
}
