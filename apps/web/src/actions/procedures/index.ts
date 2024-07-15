import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { createServerActionProcedure } from 'zsa'

/**
 * Procedures allow you to add additional context to a set of server actions,
 * such as the userId of the caller.
 * Docs: https://zsa.vercel.app/docs/procedures
 */
export const authProcedure = createServerActionProcedure().handler(async () => {
  const data = (await getCurrentUser()).unwrap()
  return { session: data.session!, workspace: data.workspace, user: data.user }
})
