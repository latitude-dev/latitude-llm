import { NotFoundPageComponent } from '$/components/NotFound'
import { ROUTES } from '$/services/routes'

export default function Default() {
  return (
    <NotFoundPageComponent
      route={ROUTES.datasetsV2.root()}
      label='Go to datasets'
      message="We couldn't the dataset you are looking for. Please make sure that the dataset exists and try again."
    />
  )
}
