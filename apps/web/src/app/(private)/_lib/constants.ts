import { ROUTES } from '$/services/routes'

export const MAIN_NAV_LINKS = [
  {
    label: 'Projects',
    value: ROUTES.dashboard.root,
    route: ROUTES.dashboard.root,
  },
  {
    label: 'Datasets',
    value: ROUTES.datasets.root(),
    route: ROUTES.datasets.root(),
  },
  {
    label: 'Settings',
    value: ROUTES.settings.root,
    route: ROUTES.settings.root,
  },
]
