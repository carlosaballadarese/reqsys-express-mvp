import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singletons — createClient se llama solo en el primer request,
// nunca durante el build de Next.js (donde las env vars no están disponibles).

let _admin: SupabaseClient | undefined
let _anon: SupabaseClient | undefined

export function adminClient(): SupabaseClient {
  return (_admin ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ))
}

export function anonClient(): SupabaseClient {
  return (_anon ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))
}
