import { ReactNode } from 'react'
import { ExperimentsTable } from './_components/ExperimentsTable'

export default async function ExperimentsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params
  return (
    <div className='w-full p-6'>
      <ExperimentsTable />
      {/* {children} */}
    </div>
  )
}
