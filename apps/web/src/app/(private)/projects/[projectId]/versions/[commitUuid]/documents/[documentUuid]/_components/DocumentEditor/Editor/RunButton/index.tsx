import { ToolBarWrapper } from '$/components/ChatWrapper/ChatTextArea/ToolBar'
import type { ResolvedMetadata } from '$/workers/readMetadata'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { memo } from 'react'

export const RunButton = memo(
  ({
    metadata,
    runPromptButtonLabel,
    runPromptButtonHandler,
    toggleExperimentModal,
  }: {
    metadata: ResolvedMetadata | undefined
    runPromptButtonLabel: string
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
            onClick={runPromptButtonHandler}
            fancy={true}
            roundy={true}
            userSelect={false}
          >
            {runPromptButtonLabel}
          </Button>
        )}
        <Button
          variant='outline'
          onClick={toggleExperimentModal}
          fancy={true}
          roundy={true}
          userSelect={false}
        >
          Run experiment
        </Button>
      </ToolBarWrapper>
    )
  },
)
