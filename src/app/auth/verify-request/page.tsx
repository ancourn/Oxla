import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function VerifyRequest() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We sent you a sign-in link. Click the link to sign in to your account.
          </p>
        </div>
        
        <div className="mt-8 space-y-4">
          <div className="rounded-md bg-blue-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Didn't receive the email?
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Check your spam folder or request another sign-in link.
                  </p>
                </div>
                <div className="mt-4">
                  <div className="flex">
                    <Link
                      href="/auth/signin"
                      className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    >
                      Back to sign in
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}