import { Button, GitHubIcon, GoogleIcon, Icon, Text } from "@repo/ui";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Mail } from "lucide-react";
import { useState } from "react";

/**
 * Signup page - matches https://app.latitude.so/login design
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const WEB_BASE_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

// Latitude logo SVG - actual implementation from legacy
const LatitudeLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...props}>
    <title>Latitude</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.92908e-05 12.9825C-0.000146101 12.9876 0.000264683 12.9929 5.92915e-05 12.998L2.28025 12.998C2.53495 8.96957 5.90153 5.77716 10.0001 5.77716C14.0936 5.77716 17.4501 8.96879 17.712 12.998L20 12.998C19.74 7.70424 15.3652 3.49923 10.0002 3.49923C4.64031 3.49923 0.267973 7.69573 0.000322466 12.9823L5.92908e-05 12.9825Z"
      fill="#0080FF"
    />
    <path
      d="M19.9998 13.9941C19.9578 14.864 19.8043 15.7039 19.5547 16.5007L0.445068 16.5007C0.19543 15.7039 0.0420302 14.864 0 13.9941L19.9998 13.9941Z"
      fill="#030712"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.28458 12.998L6.00826 12.998C6.25515 11.0171 7.95449 9.48451 10.0005 9.48451C12.0416 9.48451 13.7292 11.0239 13.9849 12.998L16.7164 12.998C16.459 9.50688 13.5566 6.77195 10.0004 6.77195C6.44155 6.77195 3.5384 9.51261 3.28442 12.998L3.28458 12.998Z"
      fill="#E63948"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.02004 12.998L12.973 12.998C12.729 11.5654 11.4995 10.4718 10.0002 10.4718C8.49606 10.4718 7.25845 11.5639 7.01978 12.998L7.02004 12.998Z"
      fill="#FEC61A"
    />
  </svg>
);

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const emailValue = formData.get("email") as string;

    setIsLoading(true);
    setError(undefined);
    setEmail(emailValue);

    try {
      // Step 1: Create user account
      const response = await fetch(`${API_BASE_URL}/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailValue,
          name,
          password: generateSecurePassword(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to create account");
      }

      // Step 2: Send magic link for authentication
      const magicLinkResponse = await fetch(`${API_BASE_URL}/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailValue,
          callbackURL: WEB_BASE_URL,
          newUserCallbackURL: WEB_BASE_URL,
        }),
      });

      if (!magicLinkResponse.ok) {
        const data = await magicLinkResponse.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to send magic link");
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleClick = () => {
    window.location.href = `${API_BASE_URL}/auth/sign-in/social?provider=google`;
  };

  const handleGitHubClick = () => {
    window.location.href = `${API_BASE_URL}/auth/sign-in/social?provider=github`;
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <div className="flex flex-col items-center justify-center gap-y-6 max-w-[22rem] w-full">
          <LatitudeLogo />

          <div className="flex flex-col items-center gap-4 w-full">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={Mail} className="h-6 w-6 text-primary" />
            </div>
            <Text.H3 align="center">Check your email</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              We sent a magic link to <strong>{email}</strong>
            </Text.H5>
            <Text.H6 color="foregroundMuted" align="center">
              Click the link in the email to sign in. The link will expire in 1 hour.
            </Text.H6>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setIsSuccess(false);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
        {/* Header with logo */}
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Welcome to Latitude</Text.H3>
          </div>
        </div>

        {/* Card container */}
        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Text.H6 weight="medium">Name</Text.H6>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Jon Snow"
                required
                autoComplete="name"
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="medium">Email</Text.H6>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Ex.: jon@example.com"
                required
                autoComplete="email"
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="medium">Workspace Name</Text.H6>
              <input
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Acme Inc."
                required
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}

            <Button
              size="full"
              type="submit"
              disabled={isLoading}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all"
            >
              {isLoading ? "Creating..." : "Create account"}
            </Button>
          </form>

          {/* Or divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="bg-muted/50 px-2 text-xs leading-4 text-muted-foreground">Or</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleGoogleClick}
              disabled={isLoading}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
            >
              <GoogleIcon className="mr-2" />
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={handleGitHubClick}
              disabled={isLoading}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
            >
              <GitHubIcon className="mr-2" />
              Continue with GitHub
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center justify-center gap-y-4">
          <Text.H6 color="foregroundMuted" align="center">
            If you have any problem or suggestion check our{" "}
            <a
              href="https://docs.latitude.so"
              className="text-accent-foreground underline hover:no-underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              documentation
            </a>{" "}
            or contact us via{" "}
            <a
              href="mailto:hello@latitude.so"
              className="text-accent-foreground underline hover:no-underline"
            >
              email
            </a>{" "}
            or{" "}
            <a
              href="https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw"
              className="text-accent-foreground underline hover:no-underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Slack
            </a>
            .
          </Text.H6>

          <Text.H6 color="foregroundMuted" align="center">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-accent-foreground underline hover:no-underline inline-flex items-center gap-1"
            >
              Sign in
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <title>Arrow right</title>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </Text.H6>
        </div>
      </div>
    </div>
  );
}

// Generate a secure random password for passwordless auth
function generateSecurePassword(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
