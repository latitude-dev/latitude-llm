import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import {
  PromptSpanMetadata,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCallback, useMemo } from 'react'

export function SpanParameters({
  span,
}: {
  span: SpanWithDetails<SpanType.Prompt>
}) {
  const parametersArray = useMemo(() => {
    return Object.entries((span.metadata as PromptSpanMetadata).parameters)
      .map(([parameter, value]) => {
        if (!span.metadata || !('parameters' in span.metadata)) return null

        if (value === undefined || value === null) {
          value = ''
        } else if (typeof value === 'object' || Array.isArray(value)) {
          try {
            value = JSON.stringify(value)
          } catch (error) {
            value = String(value)
          }
        } else {
          value = String(value)
        }

        return {
          parameter,
          value,
        }
      })
      .filter(Boolean) as Array<{ parameter: string; value: string }>
  }, [span.metadata])

  if (!parametersArray.length) return null

  return (
    <div className='flex flex-col gap-y-1'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H5M color='foreground'>Parameters</Text.H5M>
        <UseSpanInEditorButton span={span} />
      </div>
      <div className='grid grid-cols-[auto_1fr] gap-y-3'>
        {parametersArray.map(({ parameter, value }, index) => {
          const file = asPromptLFile(value)
          return (
            <div
              key={index}
              className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
            >
              <div className='flex flex-row items-center gap-x-2 min-h-8'>
                <Badge variant='accent'>
                  &#123;&#123;{parameter}&#125;&#125;
                </Badge>
              </div>
              <div className='flex flex-grow w-full min-w-0'>
                {file ? (
                  <PromptLFileParameter file={file} />
                ) : (
                  <TextArea
                    value={String(value || '')}
                    minRows={1}
                    maxRows={6}
                    disabled={true}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UseSpanInEditorButton({ span }: { span: SpanWithDetails }) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const navigate = useNavigate()
  const {
    history: { setHistoryLog },
    setSource,
  } = useDocumentParameters({ document, commitVersionUuid: commit.uuid })
  const url = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).root
  const route = `${url}?spanId=${span.id}&traceId=${span.traceId}&showPreview=true`
  const handleClick = useCallback(() => {
    if (!span.documentUuid) return
    if (!span.documentLogUuid) return

    setSource('history')
    setHistoryLog({ uuid: span.documentLogUuid, source: span.source })

    navigate.push(route)
  }, [
    navigate,
    route,
    setSource,
    setHistoryLog,
    span.documentLogUuid,
    span.documentUuid,
    span.source,
  ])

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          onClick={handleClick}
          iconProps={{
            name: 'arrowRight',
            widthClass: 'w-4',
            heightClass: 'h-4',
            placement: 'right',
          }}
          variant='link'
          size='none'
          containerClassName='rounded-xl pointer-events-auto'
          className='rounded-xl'
        >
          Use
        </Button>
      }
    >
      Open editor with this span
    </Tooltip>
  )
}
