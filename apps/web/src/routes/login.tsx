import { Text } from "@repo/ui";
import { useState } from "react";
import { MagicLinkForm, OAuthButtons } from "../components/auth/index.js";

/**
 * Login page
 *
 * Provides Magic Link and OAuth authentication options.
 * Email/password is CLI-only and not exposed in the web UI.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleMagicLinkSubmit = async (email: string) => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          callbackURL: "/dashboard",
          newUserCallbackURL: "/onboarding",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to send magic link");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err; // Re-throw so the form can handle it
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <Text.H1 className="mb-2">Welcome to Latitude</Text.H1>
        <Text.H4 color="foregroundMuted">Sign in to continue</Text.H4>
      </div>

      <div className="w-full max-w-md space-y-6">
        <MagicLinkForm onSubmit={handleMagicLinkSubmit} isLoading={isLoading} error={error} />

        <OAuthButtons
          onGoogleClick={handleGoogleClick}
          onGitHubClick={handleGitHubClick}
          isLoading={isLoading}
        />
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        By signing in, you agree to our Terms of Service and Privacy Policy
      </div>
    </div>
  );
}
