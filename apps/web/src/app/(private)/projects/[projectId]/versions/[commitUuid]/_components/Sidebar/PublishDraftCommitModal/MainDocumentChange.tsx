import { cn } from '@latitude-data/web-ui/utils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import useDocumentVersions from '$/stores/documentVersions'
import { useMemo } from 'react'

export function MainDocumentChange({ commit }: { commit: Commit }) {
  const { data: documents, isLoading } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: commit.projectId,
  })

  const mainDocument = useMemo(() => {
    return documents?.find((d) => d.documentUuid === commit.mainDocumentUuid)
  }, [documents, commit.mainDocumentUuid])

  return (
    <div
      className={cn('overflow-hidden', {
        'flex flex-col gap-y-1': !isLoading,
      })}
    >
      <Text.H5M>Main prompt</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar p-1',
          'gap-y-2 divide-y divide-border overflow-y-auto',
        )}
      >
        {isLoading ? (
          <DocumentChangeSkeleton
            width={62}
            changeType={ModifiedDocumentType.UpdatedPath}
          />
        ) : mainDocument ? (
          <Link
            href={
              ROUTES.projects
                .detail({ id: commit.projectId })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: mainDocument.documentUuid }).root
            }
            className='w-full'
          >
            <DocumentChange
              path={mainDocument.path}
              changeType={ModifiedDocumentType.UpdatedPath}
              isSelected={false}
            />
          </Link>
        ) : (
          <DocumentChange
            path={'No main document'}
            changeType={ModifiedDocumentType.Deleted}
            isSelected={false}
          />
        )}
      </ul>
    </div>
  )
}
