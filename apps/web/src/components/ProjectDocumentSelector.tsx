'use client'

import { FormField, Select } from '@latitude-data/web-ui'
import useProjects from '$/stores/projects'

interface ProjectDocumentSelectorProps {
  defaultProjectId?: number
  documents: { path: string; documentUuid: string }[]
  onProjectChange: (projectId: number) => void
  onDocumentChange: (documentUuid: string) => void
  labelInfo?: string
}

export function ProjectDocumentSelector({
  defaultProjectId,
  documents,
  onProjectChange,
  onDocumentChange,
  labelInfo,
}: ProjectDocumentSelectorProps) {
  const { data: projects } = useProjects()

  const handleProjectChange = (value: string) => {
    const newProjectId = Number(value)
    onProjectChange(newProjectId)
  }

  const handleDocumentChange = (value: string) => {
    onDocumentChange(value)
  }

  return (
    <div className='flex flex-row gap-4'>
      <FormField label='Project'>
        <Select
          name='projectId'
          options={projects.map((p) => ({ label: p.name, value: p.id }))}
          onChange={handleProjectChange}
          defaultValue={String(defaultProjectId)}
        />
      </FormField>
      <FormField label='Prompt' info={labelInfo}>
        <Select
          disabled={!documents.length}
          name='documentUuid'
          options={documents.map((d) => ({
            label: d.path,
            value: d.documentUuid,
          }))}
          onChange={handleDocumentChange}
        />
      </FormField>
    </div>
  )
}
