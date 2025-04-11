import {
  LATITUDE_DOCS_URL,
  LATITUDE_HELP_URL,
} from '@latitude-data/core/browser'
import { ROUTES } from '$/services/routes'

export const NAV_LINKS = [
  { label: 'Docs', href: LATITUDE_DOCS_URL },
  { label: 'Community', href: LATITUDE_HELP_URL },
]

export const MAIN_NAV_LINKS = [
  { label: 'Projects', value: ROUTES.dashboard.root as string },
  { label: 'Datasets', value: ROUTES.datasets.root() },
  { label: 'Settings', value: ROUTES.settings.root as string },
]
