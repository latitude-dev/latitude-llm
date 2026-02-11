import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { unsafelyFindUserById } from '../../queries/users/findById'
import { ExportReadyMailer } from '../../mailer/mailers/exports/ExportReadyMailer'
import { EventHandler, ExportReadyEvent } from '../events'

/**
 * Notifies the client when an export is ready to be downloaded
 */
export const notifyClientOfExportReady: EventHandler<
  ExportReadyEvent
> = async ({ data }) => {
  const { workspaceId, userId, uuid } = data.data
  const user = await unsafelyFindUserById({ id: userId })
  if (!user) return

  const workspace = await unsafelyFindWorkspace(Number(workspaceId))
  if (!workspace) return

  const mailer = new ExportReadyMailer(
    {
      token: uuid,
      user,
    },
    {
      to: user.email,
    },
  )

  await mailer.send()
}
