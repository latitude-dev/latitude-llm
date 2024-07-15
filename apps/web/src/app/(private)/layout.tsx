import { ReactNode } from 'react'

import Sidebar from '$/components/Sidebar'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function PrivateLayout({
  children,
}: {
  children: ReactNode
}) {
  const data = await getSession()
  if (!data.session) {
    return redirect(ROUTES.auth.login)
  }
  return (
    <main className='flex flex-row w-full'>
      <div className='w-[280px]'>
        <Sidebar />
      </div>
      <div className='flex-1'>{children}</div>
    </main>
  )
}
