'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: { [key: string]: string } = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You do not have permission to sign in.",
    Verification: "The verification token has expired or has already been used.",
    Default: "An error occurred during sign in.",
  };

  const errorMessage = errorMessages[error || 'Default'] || errorMessages.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Authentication Error</CardTitle>
            <CardDescription className="text-center">
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">
                {error === 'Configuration' && 'Please try again later or contact support.'}
                {error === 'AccessDenied' && 'You may need to contact an administrator for access.'}
                {error === 'Verification' && 'Please request a new verification email.'}
                {!error && 'Please try signing in again.'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/signin">
                  Try Again
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/">
                  Back to Home
                </Link>
              </Button>
            </div>
            
            {error === 'Verification' && (
              <div className="text-center">
                <Link
                  href="/auth/signin"
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Request new verification email
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}