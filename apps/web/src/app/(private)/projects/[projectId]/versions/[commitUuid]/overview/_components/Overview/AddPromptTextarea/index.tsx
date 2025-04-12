'use client'

import { ChangeEvent } from 'react'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useState } from 'react'

export function AddPromptTextarea() {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [content, setContent] = useState('')
  const { createFile } = useDocumentVersions(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onSuccessCreate: (document) => {
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({
              uuid: commit.uuid,
            })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      },
    },
  )
  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value)
    },
    [setContent],
  )
  const onCreate = useCallback(() => {
    if (!content) return
    createFile({
      path: `prompt-${Date.now()}`,
      content,
    })
  }, [createFile, content])
  return (
    <div className='relative h-fit rounded-md inline-flex disabled:opacity-50 disabled:pointer-events-none bg-secondary hover:bg-secondary/60 border-0 shadow-[inset_0px_0px_0px_1px_hsl(var(--input))] w-full'>
      <div className='relative w-full flex flex-col gap-y-4 items-center justify-center rounded-md font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:opacity-50 group-disabled:pointer-events-none text-sm leading-5 border-input bg-background group-hover:bg-secondary group-hover:text-secondary-foreground/80 px-3 border-0 shadow-[inset_0px_0px_0px_1px_hsl(var(--input))] py-4'>
        <div className='flex flex-col gap-1 px-1'>
          <Text.H4M>Paste your prompt here</Text.H4M>
          <Text.H5 color='foregroundMuted'>
            Get started by pasting your prompt here, we'll set up an evaluation
            based on it automatically so you can start testing at scale right
            away.
          </Text.H5>
        </div>
        <TextArea
          name='prompt'
          rows={4}
          placeholder='Paste your prompt...'
          onChange={onChange}
          value={content}
        />
        <div className='w-full flex'>
          <Button fancy variant='outline' onClick={onCreate}>
            Create prompt
          </Button>
        </div>
      </div>
    </div>
  )
}
