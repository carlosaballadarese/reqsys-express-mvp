import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/anonClient()/server'
import { anonClient } from '@/lib/supabase/clients'

export async function POST() {
  const anonClient() = await createSupabaseServerClient()
  await anonClient().auth.signOut()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))
}
