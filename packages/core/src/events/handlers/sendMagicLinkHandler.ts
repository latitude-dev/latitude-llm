import { unsafelyGetUser } from '../../data-access'
import { NotFoundError } from '../../lib'
import { MagicLinkMailer } from '../../mailers'
import { MagicLinkTokenCreated } from '../events'

export async function sendMagicLinkJob({
  data: event,
}: {
  data: MagicLinkTokenCreated
}) {
  const user = await unsafelyGetUser(event.data.userId)
  if (!user) throw new NotFoundError('User not found')

  const mailer = new MagicLinkMailer(
    {
      to: user.email,
    },
    {
      user: user.name!,
      magicLinkToken: event.data.token,
    },
  )

  await mailer.send().then((r) => r.unwrap())
}
