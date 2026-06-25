import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { count, error } = await supabase
    .from('amr_genes')
    .select('id', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', genes: count })
}
