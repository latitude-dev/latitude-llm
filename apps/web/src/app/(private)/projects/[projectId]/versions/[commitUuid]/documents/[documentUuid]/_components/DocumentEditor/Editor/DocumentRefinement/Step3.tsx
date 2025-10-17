import { Text } from '@latitude-data/web-ui/atoms/Text'
import { FakeProgress } from '@latitude-data/web-ui/molecules/FakeProgress'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'
import { useEffect } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export function Step3({
  refine,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  refine: () => Promise<void>
}) {
  // FIXME: Do not run side effects on useEffect, move to event handler.
  useEffect(() => {
    refine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4'>
      <div className='max-w-lg flex flex-col gap-6 items-center'>
        <div className='flex flex-col gap-2'>
          <Text.H4 align='center' display='block'>
            Refining prompt...
          </Text.H4>
          <Text.H5 align='center' display='block' color='foregroundMuted'>
            This could take some time
          </Text.H5>
        </div>
        <div className='flex flex-col gap-y-4 items-center justify-center'>
          <FakeProgress completed={false} />
          <LoadingText />
        </div>
      </div>
    </div>
  )
}
