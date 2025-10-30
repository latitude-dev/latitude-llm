import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { memo, useCallback } from 'react'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { useIncludabledPrompts } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/BlocksEditor/useIncludabledPrompts'
import { BlocksEditor } from '$/components/BlocksEditor'
import { BlockRootNode } from '$/components/BlocksEditor/Editor/state/promptlToLexical/types'

export const OnboardingEditor = memo(
  ({
    initialValue,
    readOnly,
  }: {
    initialValue: BlockRootNode
    readOnly: boolean
  }) => {
    const { project } = useCurrentProject()
    const { commit } = useCurrentCommit()
    const { updateDocumentContent } = useDocumentValue()
    const { document } = useCurrentDocument()

    const onError = useCallback((error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error during edition',
        description: error.message,
      })
    }, [])

    const prompts = useIncludabledPrompts({
      project,
      commit,
      document,
      documents: [document],
    })
    return (
      <div className='relative flex-1 w-full h-full max-w-[600px]'>
        <BlocksEditor
          project={project}
          commit={commit}
          document={document}
          currentDocument={document}
          initialValue={initialValue}
          placeholder='Type your instructions here, use {{ input }} for variables and / for commands'
          onError={onError}
          prompts={prompts}
          onChange={updateDocumentContent}
          greyTheme={true}
          readOnlyMessage={readOnly ? ' ' : undefined}
        />
      </div>
    )
  },
)
