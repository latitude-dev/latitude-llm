import { Section } from "@react-email/components"
import { ContainerLayout } from "../components/ContainerLayout.js"

interface SignupExistingAccountMagicLinkEmailProps {
  readonly userName: string
  readonly magicLinkUrl: string
}

export function SignupExistingAccountMagicLinkEmail({
  userName,
  magicLinkUrl,
}: SignupExistingAccountMagicLinkEmailProps) {
  return (
    <ContainerLayout previewText="Sign in to your existing Latitude account">
      <h4 className="text-lg font-medium text-foreground m-0 mb-2">Hi {userName},</h4>
      <p className="text-base text-foreground m-0 mb-2">Looks like this email is already registered in Latitude.</p>
      <p className="text-base text-foreground m-0 mb-6">Use this secure link to sign in to your existing account.</p>

      <Section className="mt-6">
        <a
          href={magicLinkUrl}
          className="inline-block text-center font-medium rounded-lg no-underline text-sm leading-5 bg-primary text-white border border-primary-dark-1 py-[5px] px-3"
        >
          Sign In To Latitude
        </a>
      </Section>

      <p className="text-sm text-muted-foreground mt-8 mb-0">
        This link will expire in 1 hour and can only be used once.
      </p>
    </ContainerLayout>
  )
}
