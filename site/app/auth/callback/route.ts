import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Auto-create curator record for new signups.
      // Name and affiliation were stored in user_metadata during signUp().
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Check if curator record already exists
        const { data: existing } = await supabase
          .from('curators')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (!existing) {
          // Create curator record with metadata or defaults
          const { error: insertError } = await supabase
            .from('curators')
            .insert({
              id: user.id,
              email: user.email!,
              name: (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'Curator',
              affiliation: (user.user_metadata?.affiliation as string) || null,
            })

          if (insertError) {
            console.error('Error creating curator record:', insertError)
            // Don't fail - user is logged in even if curator record creation fails
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
