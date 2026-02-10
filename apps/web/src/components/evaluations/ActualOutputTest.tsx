import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MessageList, MessageListSkeleton } from '$/components/ChatWrapper'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { ActualOutputConfiguration } from '@latitude-data/core/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { LineSeparator } from '@latitude-data/web-ui/atoms/LineSeparator'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { useEvaluatedTraces } from './useEvaluatedTraces'

export function ActualOutputTest({
  configuration,
}: {
  configuration: ActualOutputConfiguration
}) {
  const router = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const {
    selectedTrace,
    isLoading,
    onNextPage,
    hasNextPage,
    onPrevPage,
    hasPrevPage,
  } = useEvaluatedTraces({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    configuration,
  })

  if (isLoading) {
    return (
      <>
        <div className='w-full flex justify-between items-center gap-4'>
          <Skeleton className='w-48 h-5' />
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowLeft',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              disabled
            />
            <Button
              variant='outline'
              size='icon'
              iconProps={{
                name: 'arrowRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
              disabled
            />
          </div>
        </div>
        <div className='w-full flex flex-col gap-2'>
          <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
            <MessageListSkeleton messages={3} />
          </div>
          <LineSeparator text='Actual output' />
          <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
            <Skeleton className='w-full h-32' />
          </div>
        </div>
      </>
    )
  }

  if (!isLoading && !selectedTrace) {
    return (
      <Alert
        variant='warning'
        showIcon={false}
        centered={true}
        description={
          <Text.H5 color='warningMutedForeground' centered>
            No logs generated so far, try the prompt
            <Button
              variant='link'
              size='none'
              iconProps={{
                name: 'arrowRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
              className='pl-2'
              onClick={(event) => {
                event.preventDefault()
                router.push(
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid }).editor
                    .root,
                )
              }}
            >
              in the playground
            </Button>
          </Text.H5>
        }
      />
    )
  }

  const trace = selectedTrace!

  return (
    <>
      <div className='w-full flex justify-between items-center gap-4'>
        {trace.documentLogUuid ? (
          <span className='flex items-center gap-2'>
            <ClickToCopyUuid uuid={trace.documentLogUuid} />
          </span>
        ) : null}
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            iconProps={{
              name: 'arrowLeft',
              widthClass: 'w-4',
              heightClass: 'h-4',
            }}
            onClick={(event) => {
              event.preventDefault()
              onPrevPage()
            }}
            disabled={!hasPrevPage}
          />
          <Button
            variant='outline'
            size='icon'
            iconProps={{
              name: 'arrowRight',
              widthClass: 'w-4',
              heightClass: 'h-4',
            }}
            onClick={(event) => {
              event.preventDefault()
              onNextPage()
            }}
            disabled={!hasNextPage}
          />
        </div>
      </div>
      <div className='min-w-0 flex flex-col gap-2'>
        <div className='flex min-w-0 max-h-60 custom-scrollbar scrollable-indicator'>
          <MessageList messages={trace.messages} debugMode />
        </div>
        <LineSeparator text='Actual output' />
        <div className='w-full max-h-60 custom-scrollbar scrollable-indicator'>
          <div className='rounded-xl bg-backgroundCode border border-muted-foreground/10 px-4 py-3'>
            <Text.H5
              monospace
              color='foregroundMuted'
              whiteSpace='preWrap'
              wordBreak='breakAll'
            >
              {trace.actualOutput}
            </Text.H5>
          </div>
          {trace.actualOutput === '' && (
            <div className='mt-1'>
              <Text.H6 color='foregroundMuted' isItalic>
                (Actual output is either empty or null)
              </Text.H6>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
