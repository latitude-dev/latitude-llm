import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
} from "@repo/ui";
import { useState } from "react";

/**
 * Magic Link login form
 *
 * Passwordless authentication via email link.
 * Users enter their email and receive a magic link to sign in.
 */

interface MagicLinkFormProps {
  readonly onSubmit: (email: string) => Promise<void>;
  readonly isLoading?: boolean;
  readonly error?: string | undefined;
}

export const MagicLinkForm = ({ onSubmit, isLoading, error }: MagicLinkFormProps) => {
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isLoading) return;

    await onSubmit(email);
    setIsSent(true);
  };

  if (isSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon name="Mail" className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a magic link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Click the link in the email to sign in. The link will expire in 1 hour.
          </p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsSent(false);
              setEmail("");
            }}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Sign in to Latitude</CardTitle>
        <CardDescription>Enter your email to receive a magic link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <Icon name="AlertCircle" size="sm" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading ?? false} disabled={!email}>
            <Icon name="Mail" size="sm" className="mr-2" />
            Send magic link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
