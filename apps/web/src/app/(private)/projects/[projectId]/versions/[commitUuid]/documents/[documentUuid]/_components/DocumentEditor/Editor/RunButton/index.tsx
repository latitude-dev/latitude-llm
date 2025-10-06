import { ToolBarWrapper } from '$/components/ChatWrapper/ChatTextArea/ToolBar'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { memo } from 'react'

type RunButtonProps = {
  label: string
  iconProps: Pick<IconProps, 'name'>
}

export const RunButton = memo(
  ({
    metadata,
    runPromptButtonProps,
    runPromptButtonHandler,
    toggleExperimentModal,
    showPlayground,
    onBack,
  }: {
    metadata: ResolvedMetadata | undefined
    runPromptButtonProps: RunButtonProps
    runPromptButtonHandler: () => void
    toggleExperimentModal: () => void
    onBack: () => void
    showPlayground: boolean
  }) => {
    const leftButtonLabel = showPlayground ? 'Edit' : 'Run experiment'
    const leftButtonIconProps = showPlayground
      ? { name: 'arrowLeft' as const }
      : undefined
    const leftButtonHandler = showPlayground ? onBack : toggleExperimentModal

    return (
      <ToolBarWrapper>
        <Button
          variant='outline'
          onClick={leftButtonHandler}
          fancy={true}
          roundy={true}
          userSelect={false}
          {...(leftButtonIconProps ? { iconProps: leftButtonIconProps } : {})}
        >
          {leftButtonLabel}
        </Button>
        {(metadata?.errors.length ?? 0) > 0 ? (
          <Tooltip
            side='bottom'
            asChild
            trigger={
              <Button iconProps={{ name: 'play' }} fancy disabled>
                Run
              </Button>
            }
          >
            There are errors in your prompt. Please fix them before running.
          </Tooltip>
        ) : (
          <Button
            iconProps={{
              name: runPromptButtonProps.iconProps.name,
              placement: 'right',
            }}
            onClick={runPromptButtonHandler}
            fancy={true}
            roundy={true}
            userSelect={false}
          >
            {runPromptButtonProps.label}
          </Button>
        )}
      </ToolBarWrapper>
    )
  },
)
