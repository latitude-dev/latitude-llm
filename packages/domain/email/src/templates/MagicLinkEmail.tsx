import { Section } from "@react-email/components";
import { ContainerLayout } from "../components/ContainerLayout.js";

interface MagicLinkEmailProps {
  readonly userName: string;
  readonly magicLinkUrl: string;
}

export function MagicLinkEmail({ userName, magicLinkUrl }: MagicLinkEmailProps) {
  return (
    <ContainerLayout previewText="Log in with this magic link">
      <h4 className="text-lg font-medium text-foreground m-0 mb-2">Hi {userName},</h4>
      <p className="text-base text-foreground m-0 mb-6">
        Here&apos;s your magic link to access Latitude.
      </p>

      <Section className="mt-6">
        <a
          href={magicLinkUrl}
          className="inline-block text-center font-medium rounded-lg no-underline text-sm leading-5 bg-primary text-white border border-primary-dark-1 py-[5px] px-3"
        >
          Access Latitude
        </a>
      </Section>

      <p className="text-sm text-muted-foreground mt-8 mb-0">
        This link will expire in 1 hour and can only be used once.
      </p>
    </ContainerLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  userName: "Jon",
  magicLinkUrl: "https://app.latitude.so/magic-links/confirm/asdlkjfhadslkfjhadslkfjhdaskljh",
};
