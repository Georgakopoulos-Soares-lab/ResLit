import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'

/**
 * Lightweight guard: redirects unauthenticated requests to /curator/* pages
 * (other than login/signup/reset-password) to the login page. Only checks
 * cookie presence, not DB validity — the authoritative check is
 * getCurrentCurator() in each page/server action, which this is
 * defense-in-depth for, not a replacement for.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isCuratorRoute = pathname.startsWith('/curator/') && !['/curator/login', '/curator/signup', '/curator/reset-password'].includes(pathname)

  if (isCuratorRoute && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/curator/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
