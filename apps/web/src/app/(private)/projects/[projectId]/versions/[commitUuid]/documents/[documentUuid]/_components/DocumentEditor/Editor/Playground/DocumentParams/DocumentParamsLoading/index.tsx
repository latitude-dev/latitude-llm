import {
  Inputs,
  InputSource,
  PlaygroundInput,
} from '@latitude-data/core/browser'
import { TABS } from '../index'
import { ParameterInputSkeleton } from '$/components/ParameterInput'
import { ParameterTypeSelector } from '../ManualParams/ParameterTypeSelector'
import { ParameterType } from '@latitude-data/constants'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

const FAKE_INPUTS: Inputs<InputSource> = {
  '...': {
    value: '...',
    metadata: {
      type: ParameterType.Text,
    },
  },
}
const fakeSetPrompt = (_prompt: string) => {}
const fakeSetInput = (
  _param: string,
  _input: PlaygroundInput<InputSource>,
) => {}

function LoadingInput() {
  return (
    <div className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'>
      <div className='flex flex-row items-center gap-x-2 min-h-8'>
        <ParameterTypeSelector
          disabled
          parameter='...'
          prompt='...'
          setPrompt={fakeSetPrompt}
          inputs={FAKE_INPUTS}
          setInput={fakeSetInput}
        />
        <Badge variant='accent'>&#123;&#123;...&#125;&#125;</Badge>
      </div>
      <div className='flex flex-grow w-full min-w-0'>
        <ParameterInputSkeleton />
      </div>
    </div>
  )
}

const LOADING_INPUTS = Array.from({ length: 3 }, (_, i) => i)
function LoadingContent({ source }: { source: InputSource }) {
  return (
    <div className='w-full flex flex-col gap-4'>
      <TabSelector fullWidth options={TABS} selected={source} />
      <div className='flex flex-col gap-3'>
        <div className='grid grid-cols-[auto_1fr] gap-y-3'>
          {LOADING_INPUTS.map((_, idx) => (
            <LoadingInput key={idx} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DocumentParamsLoading({
  source,
}: {
  source: InputSource
}) {
  return (
    <ClientOnly>
      <CollapsibleBox
        initialExpanded={true}
        title='Parameters'
        icon='braces'
        expandedContent={<LoadingContent source={source} />}
      />
    </ClientOnly>
  )
}
