import { unsafelyGetUser } from '../../data-access'
import { MagicLinkMailer } from '../../mailers'
import { MagicLinkTokenCreated } from '../events'
import { NotFoundError } from './../../lib/errors'

export async function sendMagicLinkJob({
  data: event,
}: {
  data: MagicLinkTokenCreated
}) {
  const user = await unsafelyGetUser(event.data.userId)
  if (!user) throw new NotFoundError('User not found')
  event.data.returnTo

  const mailer = new MagicLinkMailer(
    {
      to: user.email,
    },
    {
      user: user.name!,
      magicLinkToken: event.data.token,
      returnTo: event.data.returnTo,
    },
  )

  await mailer.send().then((r) => r.unwrap())
}
