import {
  LATITUDE_DOCS_URL,
  LATITUDE_HELP_URL,
} from '@latitude-data/core/browser'
import { DocumentRoutes, ROUTES } from '$/services/routes'

export const NAV_LINKS = [
  { label: 'Docs', href: LATITUDE_DOCS_URL },
  { label: 'Help', href: LATITUDE_HELP_URL },
]

export const MAIN_NAV_LINKS = [
  { label: 'Projects', value: ROUTES.dashboard.root as DocumentRoutes },
  { label: 'Evaluations', value: ROUTES.evaluations.root as DocumentRoutes },
  { label: 'Datasets', value: ROUTES.datasets.root as DocumentRoutes },
]
