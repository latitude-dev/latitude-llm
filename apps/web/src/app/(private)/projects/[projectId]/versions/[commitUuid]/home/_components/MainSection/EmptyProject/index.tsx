import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProjectHeader } from '../_components/ProjectHeader'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useLatteSidebar } from '$/components/LatteSidebar/LatteLayout/LatteLayoutProvider'
import { useNodeInput } from '$/components/Sidebar/Files/TreeToolbar'
import { EntityType } from '../../../../../../../../../../components/Sidebar/Files/TreeToolbar'

export function EmptyProjectPage() {
  const { open: openLatteSidebar } = useLatteSidebar()
  const { setNodeInput: createNewFile } = useNodeInput()

  return (
    <div className='flex flex-col gap-8 items-center'>
      <ProjectHeader
        description={
          <Text.H5 color='foregroundMuted'>
            Wow, this project looks so empty!
          </Text.H5>
        }
      />

      <div className='flex flex-row gap-2 items-center'>
        <Button fancy variant='latte' onClick={openLatteSidebar}>
          Ask Latte to build
        </Button>

        <Button
          fancy
          variant='outline'
          onClick={() => createNewFile(EntityType.Prompt)}
        >
          Create prompt from scratch
        </Button>
      </div>
    </div>
  )
}
