'use client'

import React from 'react'

import { Text } from '@latitude-data/web-ui'
import useProjects from '$/stores/projects'
import { EditableText } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/EditableText'
import { useDebouncedCallback } from 'use-debounce'

export default function BreadcrumpInput({ projectId }: { projectId: number }) {
  const { data, update } = useProjects()
  const project = data.find((p) => p.id === projectId)
  const handleChange = useDebouncedCallback(
    (value?: string) => {
      if (!value) return
      if (!project) return

      update({ id: project.id, name: value })
    },
    250,
    { trailing: true },
  )

  if (!project) return null

  return (
    <EditableText
      value={project.name}
      handleChange={handleChange}
      fallback={(value) => <Text.H5M color='foregroundMuted'>{value}</Text.H5M>}
    />
  )
}
