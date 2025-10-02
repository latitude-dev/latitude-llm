import { ROUTES } from '$/services/routes'

export const MAIN_NAV_LINKS = [
  { label: 'Projects', value: ROUTES.dashboard.root as string },
  { label: 'Datasets', value: ROUTES.datasets.root() },
  { label: 'Settings', value: ROUTES.settings.root as string },
]
