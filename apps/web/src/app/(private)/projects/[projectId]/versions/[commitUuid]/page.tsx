import { DocumentDetailWrapper } from '@latitude-data/web-ui'

import Sidebar from './_components/Sidebar'

export const dynamic = 'force-dynamic'

export default async function CommitRoot() {
  return (
    <DocumentDetailWrapper>
      <Sidebar />
      <div className='p-32'>Main content. Remove Tailwind Styles from here</div>
    </DocumentDetailWrapper>
  )
}
