import {
  LATITUDE_DOCS_URL,
  LATITUDE_HELP_URL,
} from '@latitude-data/core/browser'
import { ROUTES } from '$/services/routes'

export const NAV_LINKS = [
  { label: 'Docs', href: LATITUDE_DOCS_URL },
  { label: 'Help', href: LATITUDE_HELP_URL },
]

export const MAIN_NAV_LINKS = [
  { label: 'Projects', href: ROUTES.dashboard.root },
  { label: 'Evaluations', href: ROUTES.evaluations.root },
  { label: 'Datasets', href: ROUTES.datasets.root },
  { label: 'Settings', href: ROUTES.settings.root },
]
