import type { ReactNode } from "react"

function FormWrapper({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}

export { FormWrapper }
