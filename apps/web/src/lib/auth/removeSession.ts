import { lucia } from '$/lib/auth'
import { Session } from 'lucia'

export async function removeSession({ session }: { session: Session }) {
  // NOTE: We dynamically import the cookies function to make Nextjs happy
  // Info: https://github.com/vercel/next.js/issues/49757
  const { cookies } = await import('next/headers')
  await lucia.invalidateSession(session.id)
  const sessionCookie = lucia.createBlankSessionCookie()
  cookies().set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes,
  )
}
