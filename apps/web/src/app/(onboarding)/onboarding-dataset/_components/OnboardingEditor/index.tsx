import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { memo, useCallback } from 'react'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { useIncludabledPrompts } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/BlocksEditor/useIncludabledPrompts'
import { BlockRootNode, BlocksEditor } from '$/components/BlocksEditor'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'

export const OnboardingEditor = memo(
  ({
    readOnly,
    initialValue,
  }: {
    readOnly: boolean
    initialValue: BlockRootNode
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
      <div className='relative flex-1 w-full max-h-full h-full pb-7 bg-backgroundCode border border-border rounded-xl'>
        <BlocksEditor
          project={project}
          commit={commit}
          document={document}
          currentDocument={document}
          initialValue={initialValue ?? emptyRootBlock}
          placeholder='Type your instructions here, use {{ input }} for variables and / for commands'
          onError={onError}
          prompts={prompts}
          onChange={updateDocumentContent}
          readOnlyMessage={readOnly ? ' ' : undefined}
          greyTheme={true}
        />
      </div>
    )
  },
)
