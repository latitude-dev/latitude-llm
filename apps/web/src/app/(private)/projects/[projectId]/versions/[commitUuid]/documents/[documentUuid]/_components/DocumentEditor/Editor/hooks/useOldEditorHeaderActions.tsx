import { useMemo } from 'react'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { UpdateToPromptLButton } from '../UpdateToPromptl'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { DocumentVersion } from '@latitude-data/core/browser'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Button } from '@latitude-data/web-ui/atoms/Button'

/**
 * DEPRECATED: This will be not needed once new editor header
 * is fully implemented.
 */
export function useOldEditorHeaderActions({
  project,
  commit,
  document,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
}) {
  return useMemo(() => {
    return {
      leftActions: (
        <ClickToCopyUuid
          tooltipContent='Click to copy the prompt UUID'
          uuid={document.documentUuid}
        />
      ),
      rightActions: (
        <>
          <Tooltip
            asChild
            trigger={
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .history.detail({
                      uuid: document.documentUuid,
                    }).root
                }
              >
                <Button
                  variant='outline'
                  size='small'
                  iconProps={{
                    name: 'history',
                    color: 'foregroundMuted',
                  }}
                />
              </Link>
            }
          >
            View prompt history
          </Tooltip>
          <UpdateToPromptLButton document={document} />
        </>
      ),
    }
  }, [project.id, commit.uuid, document])
}
