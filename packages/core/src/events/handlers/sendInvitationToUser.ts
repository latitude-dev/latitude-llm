import { unsafelyGetUser } from '../../data-access'
import { InvitationMailer } from '../../mailers'
import { MembershipCreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const sendInvitationToUserJob = async ({
  data: event,
}: {
  data: MembershipCreatedEvent
}) => {
  if (event.data.confirmedAt || !event.data.authorId) return

  const invited = await unsafelyGetUser(event.data.userId)
  if (!invited) throw new NotFoundError('Invited user not found')

  const invitee = await unsafelyGetUser(event.data.authorId)
  if (!invitee) throw new NotFoundError('Invitee user not found')

  const mailer = new InvitationMailer(
    {
      to: invited.email,
    },
    {
      invited,
      invitee,
      invitationToken: event.data.invitationToken,
    },
  )

  await mailer.send().then((r) => r.unwrap())
}
