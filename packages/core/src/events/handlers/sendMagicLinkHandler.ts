import { unsafelyFindUserById } from '../../queries/users/findById'
import { NotFoundError } from '../../lib/errors'
import { MagicLinkMailer } from '../../mailer/mailers/magicLinks/MagicLinkMailer'
import { MagicLinkTokenCreated } from '../events'
import { containsUrl } from '../../lib/containsUrl'

export async function sendMagicLinkJob({
  data: event,
}: {
  data: MagicLinkTokenCreated
}) {
  const user = await unsafelyFindUserById({ id: event.data.userId })
  if (!user) throw new NotFoundError('User not found')

  const displayName = containsUrl(user.name ?? '') ? 'there' : user.name!

  const mailer = new MagicLinkMailer(
    {
      to: user.email,
    },
    {
      user: displayName,
      magicLinkToken: event.data.token,
      returnTo: event.data.returnTo,
    },
  )

  await mailer.send().then((r) => r.unwrap())
}
