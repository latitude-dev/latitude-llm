'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
} from '@latitude-data/web-ui/molecules/BlankSlateWithSteps'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback } from 'react'

const NEW_PROMPT_NAME = 'Prompt'
const NEW_PROMPT_CONTENT = `
You are a lovable assistant — make sure to introduce yourself!
Answer succinctly, yet complete, the following user question.

<user>
  Hello! My question is: {{ question }}
</user>
`.trim()

export default function EmptyState() {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const {
    data: documents,
    createFile,
    isCreating,
  } = useDocumentVersions(
    { projectId: project.id, commitUuid: commit.uuid },
    {
      onSuccessCreate: (document) => {
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid }).editor.root,
        )
      },
    },
  )
  const onCreate = useCallback(async () => {
    if (isCreating) return

    const existing = documents.filter(
      (documents) => documents.path === NEW_PROMPT_NAME,
    ).length
    const next = documents.filter((document) =>
      document.path.startsWith(NEW_PROMPT_NAME),
    ).length

    await createFile({
      path: `${NEW_PROMPT_NAME}${existing ? `_${next}` : ''}`,
      content: NEW_PROMPT_CONTENT,
    })
  }, [isCreating, documents, createFile])

  return (
    <div className='min-h-full p-6'>
      <BlankSlateWithSteps
        title='Welcome to your project'
        description='There are no prompts created yet. Check out how it works before getting started.'
        className='rounded-2xl'
      >
        <BlankSlateStep
          number={1}
          title='Learn how it works'
          description='Watch the video below to see how Latitude helps you deploy your AI features with confidence.'
        >
          <iframe
            className='w-full aspect-video rounded-md'
            src='https://www.youtube.com/embed/jPVn9kf4GrE'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowFullScreen
            title='A quick overview of Latitude.so, the open-source prompt engineering platform.'
          />
        </BlankSlateStep>
        <BlankSlateStep
          number={2}
          title='Create a prompt'
          description='Every good AI feature starts with a prompt. Build simple chatbots or complex agents, try it out!'
          className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
        >
          <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
            <div className='max-h-[272px] overflow-hidden'>
              <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
                {`
---
provider: OpenAI
model: GPT-5
---
This is how prompts look like in Latitude. It uses PromptL our custom template syntax that gives superpowers to your prompts. Notice the configuration frontmatter and the parameter interpolations. Click the button to start building your first prompt!

Don't rawdog your prompts!
`.trim()}
              </span>
            </div>
            <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-secondary to-transparent pointer-events-none'></div>
            <div className='flex justify-center absolute right-0 bottom-4 w-full'>
              <Button
                onClick={onCreate}
                fancy
                disabled={isCreating}
                iconProps={
                  isCreating
                    ? {
                        name: 'loader',
                        className: 'animate-spin',
                      }
                    : undefined
                }
              >
                {isCreating ? 'Doing magic' : 'Create a prompt'}
              </Button>
            </div>
          </div>
        </BlankSlateStep>
      </BlankSlateWithSteps>
    </div>
  )
}
