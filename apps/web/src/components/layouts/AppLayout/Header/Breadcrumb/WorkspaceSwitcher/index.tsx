import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@latitude-data/web-ui/atoms/DropdownMenu'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useAvailableWorkspaces from '$/stores/availableWorkspaces'
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function WorkspaceSwitcher() {
  const { data: currentWorkspace } = useCurrentWorkspace()
  const {
    data: availableWorkspaces,
    switchToWorkspace,
    isSwitching,
  } = useAvailableWorkspaces()

  // Don't render dropdown if there's only one workspace or no workspaces
  const shouldShowDropdown =
    availableWorkspaces && availableWorkspaces.length > 1

  const handleWorkspaceSwitch = async (workspaceId: number) => {
    if (workspaceId === currentWorkspace?.id) return

    await switchToWorkspace(workspaceId)
  }

  const workspaceOptions =
    availableWorkspaces?.map((workspace) => {
      const isCurrent = workspace.id === currentWorkspace?.id
      const isDisabled = isSwitching || isCurrent

      return {
        label: workspace.name,
        onClick: () => handleWorkspaceSwitch(workspace.id),
        disabled: isDisabled,
        checked: isCurrent,
      }
    }) || []

  if (!shouldShowDropdown || !currentWorkspace) {
    return null
  }

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem noShrink>
        <DropdownMenu
          title='Switch Workspace'
          options={workspaceOptions}
          width='wide'
          trigger={() => (
            <DropdownMenuTrigger
              asChild
              suppressHydrationWarning
              className='flex focus:outline-none cursor-pointer'
            >
              <Button variant='ghost' className='hover:bg-muted'>
                <div className='flex flex-row items-center gap-x-2'>
                  <Text.H5 noWrap ellipsis>
                    {currentWorkspace.name}
                  </Text.H5>
                  <Icon name='chevronsUpDown' />
                </div>
              </Button>
            </DropdownMenuTrigger>
          )}
        />
      </BreadcrumbItem>
    </>
  )
}
