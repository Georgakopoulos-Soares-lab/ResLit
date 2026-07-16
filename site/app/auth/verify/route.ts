import { NextRequest, NextResponse } from 'next/server'
import { verifyEmail } from '@/lib/actions/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token = searchParams.get('token')

  if (token) {
    const result = await verifyEmail(token)
    if (result.success) {
      return NextResponse.redirect(`${origin}/curator/dashboard`)
    }
    return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(result.error || 'Verification failed')}`)
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
