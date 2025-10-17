import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProjectIcon } from './ProjectIcon'
import { ReactNode, useMemo } from 'react'
import { extractLeadingEmoji } from '@latitude-data/web-ui/textUtils'

export function ProjectHeader({ description }: { description: ReactNode }) {
  const { project } = useCurrentProject()

  const title = useMemo(
    () => extractLeadingEmoji(project.name)[1],
    [project.name],
  )

  return (
    <div className='flex flex-col gap-6 items-center max-w-[500px]'>
      <ProjectIcon />

      <div className='flex flex-col items-center gap-2 max-w-[400px]'>
        <Text.H3M>{title}</Text.H3M>
        {description}
      </div>
    </div>
  )
}
