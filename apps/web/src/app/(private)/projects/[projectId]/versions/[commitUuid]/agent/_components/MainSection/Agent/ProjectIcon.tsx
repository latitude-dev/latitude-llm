import { useCallback, useMemo } from 'react'
import { extractLeadingEmoji } from '@latitude-data/web-ui/textUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { EmojiPicker } from '@latitude-data/web-ui/atoms/EmojiPicker'
import useProjects from '$/stores/projects'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

export function ProjectIcon() {
  const { project } = useCurrentProject()
  const { update } = useProjects()

  const [emoji, restOfTitle] = useMemo(
    () => extractLeadingEmoji(project.name),
    [project.name],
  )

  const onEmojiSelect = useCallback(
    ({ emoji: newEmoji }: { emoji: string }) => {
      update({
        id: project.id,
        name: `${newEmoji} ${restOfTitle}`,
      })
    },
    [update, project.id, restOfTitle],
  )

  return (
    <EmojiPicker onEmojiSelect={onEmojiSelect}>
      <Button
        variant='ghost'
        className='flex w-16 h-16 rounded-2xl bg-background hover:bg-muted border border-border items-center justify-center'
      >
        <Text.H1>{emoji ?? '🤖'}</Text.H1>
      </Button>
    </EmojiPicker>
  )
}
