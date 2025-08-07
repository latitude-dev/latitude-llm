'use client'

import { Column1Provider } from '../contexts/column-1-context'
import { ConnectedIntegrations } from './connected-integrations'
import { Integrations } from './integrations'
import { SearchBox } from './search-box'

function Column1Content() {
  return (
    <div className='flex flex-col pb-4 h-full gap-4 custom-scrollbar'>
      <SearchBox />
      {/* <LatitudeIntegrations /> */}
      <ConnectedIntegrations />
      <Integrations />
    </div>
  )
}

export function Column1() {
  return (
    <Column1Provider>
      <Column1Content />
    </Column1Provider>
  )
}
