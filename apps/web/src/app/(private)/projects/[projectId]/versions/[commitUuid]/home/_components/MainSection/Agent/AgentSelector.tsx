'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback, useMemo, useState } from 'react'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCommits } from '$/stores/commitsStore'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function AgentSelector({ documents }: { documents: DocumentVersion[] }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { setCommitMainDocument } = useCommits()

  const [selectedDocumentUuid, setSelectedDocumentUuid] = useState<string>()
  const selectedDocument = useMemo(() => {
    return documents.find((d) => d.documentUuid === selectedDocumentUuid)
  }, [documents, selectedDocumentUuid])

  const onClick = useCallback(() => {
    setCommitMainDocument({
      projectId: project.id,
      commitId: commit.id,
      documentUuid: selectedDocumentUuid,
    })
  }, [setCommitMainDocument, project.id, commit.id, selectedDocumentUuid])

  return (
    <div className='flex flex-col gap-2 max-w-80 w-full'>
      <Select
        name='document'
        disabled={!!commit.mergedAt}
        searchable
        options={documents.map((d) => ({
          label: d.path,
          value: d.documentUuid,
        }))}
        onChange={setSelectedDocumentUuid}
      />
      <Button
        variant='default'
        fancy
        fullWidth
        disabled={!!commit.mergedAt || !selectedDocument}
        onClick={onClick}
      >
        Set as main prompt
      </Button>
    </div>
  )
}
