import { Button, Card, CardContent, CardHeader, CardTitle, GitHubIcon, GoogleIcon } from "@repo/ui";

/**
 * OAuth buttons component
 *
 * Social login options (Google, GitHub)
 */

interface OAuthButtonsProps {
  readonly onGoogleClick?: () => void;
  readonly onGitHubClick?: () => void;
  readonly isLoading?: boolean;
}

export const OAuthButtons = ({ onGoogleClick, onGitHubClick, isLoading }: OAuthButtonsProps) => {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-base font-medium">Or continue with</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={onGoogleClick}
          disabled={isLoading || !onGoogleClick}
        >
          <GoogleIcon className="mr-2" />
          Continue with Google
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={onGitHubClick}
          disabled={isLoading || !onGitHubClick}
        >
          <GitHubIcon className="mr-2" />
          Continue with GitHub
        </Button>
      </CardContent>
    </Card>
  );
};
