import { render } from "@react-email/components"
import type { ReactElement } from "react"

export async function renderEmail(component: ReactElement): Promise<string> {
  return render(component)
}
