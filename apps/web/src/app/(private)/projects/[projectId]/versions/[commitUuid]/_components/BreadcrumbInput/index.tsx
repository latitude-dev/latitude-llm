'use client'
import { EditableText } from '@latitude-data/web-ui/molecules/EditableText'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useProjects from '$/stores/projects'
import { useDebouncedCallback } from 'use-debounce'

export default function BreadcrumbInput({
  projectId,
  projectName,
}: {
  projectId: number
  projectName: string
}) {
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

  if (!project) {
    return <Text.H5 color='foregroundMuted'>{projectName}</Text.H5>
  }

  return (
    <EditableText
      value={project.name}
      handleChange={handleChange}
      fallback={(value) => <Text.H5 color='foregroundMuted'>{value}</Text.H5>}
    />
  )
}
