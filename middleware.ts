import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';
import type { NextRequest } from 'next/server';

export default withAuth(
  function middleware(req: NextRequest) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Define protected routes and their required plans
    const protectedRoutes: { [key: string]: string[] } = {
      '/dashboard': ['free', 'pro', 'enterprise'],
      '/api/advanced': ['pro', 'enterprise'],
      '/api/premium': ['enterprise'],
      '/billing': ['free', 'pro', 'enterprise'],
    };

    // Check if the current path requires a specific plan
    for (const [route, requiredPlans] of Object.entries(protectedRoutes)) {
      if (pathname.startsWith(route)) {
        const userPlan = token?.plan || 'free';
        
        if (!requiredPlans.includes(userPlan)) {
          // Redirect to upgrade page if user doesn't have required plan
          return NextResponse.redirect(new URL('/pricing', req.url));
        }
      }
    }

    // Rate limiting for free users
    if (token?.plan === 'free' && pathname.startsWith('/api/')) {
      // This is a simple example - in production, you'd want to use Redis or similar
      const currentTime = Date.now();
      const userRequests = token?.requests || [];
      
      // Remove requests older than 1 hour
      const recentRequests = userRequests.filter((time: number) => 
        currentTime - time < 3600000
      );

      // Free users are limited to 100 requests per hour
      if (recentRequests.length >= 100) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please upgrade your plan.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (public auth pages)
     * - pricing (public pricing page)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|auth|pricing).*)',
  ],
};