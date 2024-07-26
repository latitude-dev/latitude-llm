'use client'

import { Settings } from '@latitude-data/web-ui'
import useCurrentWorkspace from '$/stores/currentWorkspace'

export default function SettingsPage() {
  const { data, update } = useCurrentWorkspace()

  return <Settings workspace={data!} updateWorkspace={update} />
}
