import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { memo } from 'react'
export const EditorSettings = memo(
  ({ copilotEnabled }: { copilotEnabled: boolean }) => {
    const { value: showLineNumbers, setValue: setShowLineNumbers } =
      useLocalStorage({
        key: AppLocalStorage.editorLineNumbers,
        defaultValue: true,
      })
    const { value: wrapText, setValue: setWrapText } = useLocalStorage({
      key: AppLocalStorage.editorWrapText,
      defaultValue: true,
    })
    const { value: showMinimap, setValue: setShowMinimap } = useLocalStorage({
      key: AppLocalStorage.editorMinimap,
      defaultValue: false,
    })
    const { value: showCopilot, setValue: setShowCopilot } = useLocalStorage({
      key: AppLocalStorage.editorCopilot,
      defaultValue: true,
    })
    const { value: autoClosingTags, setValue: setAutoClosingTags } =
      useLocalStorage({
        key: AppLocalStorage.editorAutoClosingTags,
        defaultValue: true,
      })

    return (
      <div className='flex flex-row items-center'>
        <DropdownMenu
          triggerButtonProps={{
            variant: 'outline',
            size: 'small',
            className: '!bg-background',
          }}
          options={[
            {
              label: 'Show line numbers',
              onClick: () => setShowLineNumbers(!showLineNumbers),
              checked: showLineNumbers,
            },
            {
              label: 'Wrap text',
              onClick: () => setWrapText(!wrapText),
              checked: wrapText,
            },
            {
              label: 'Show minimap',
              onClick: () => setShowMinimap(!showMinimap),
              checked: showMinimap,
            },
            {
              label: 'Auto closing tags',
              onClick: () => setAutoClosingTags(!autoClosingTags),
              checked: autoClosingTags,
            },
            ...(copilotEnabled
              ? [
                  {
                    label: 'Show Copilot',
                    onClick: () => setShowCopilot(!showCopilot),
                    checked: showCopilot,
                  },
                ]
              : []),
          ]}
          side='bottom'
          align='end'
        />
      </div>
    )
  },
)
