import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ToolBarWrapper } from '$/components/ChatWrapper/ChatTextArea/ToolBar'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { memo } from 'react'

export const RunButton = memo(
  ({
    metadata,
    runPromptButtonHandler,
    toggleExperimentModal,
  }: {
    metadata: ResolvedMetadata | undefined
    runPromptButtonHandler: () => void
    toggleExperimentModal: () => void
  }) => {
    return (
      <ToolBarWrapper>
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
            iconProps={{ name: 'play' }}
            fancy
            onClick={runPromptButtonHandler}
          >
            Run
          </Button>
        )}
        <Button fancy variant='outline' onClick={toggleExperimentModal}>
          Run experiment
        </Button>
      </ToolBarWrapper>
    )
  },
)
