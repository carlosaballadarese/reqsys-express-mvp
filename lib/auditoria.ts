import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AuditoriaParams = {
  accion: string
  entidad: string
  entidad_id?: string
  referencia?: string
  detalle?: Record<string, unknown>
}

export async function registrarAuditoria(params: AuditoriaParams): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let usuario_id: string | null = null
    let usuario_email: string | null = null
    let usuario_nombre: string | null = null
    let rol: string | null = null

    if (user) {
      usuario_id = user.id
      const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('nombre, email, rol')
        .eq('id', user.id)
        .single()
      if (perfil) {
        usuario_email = perfil.email
        usuario_nombre = perfil.nombre
        rol = perfil.rol
      }
    }

    await supabaseAdmin.from('auditoria').insert({
      usuario_id,
      usuario_email,
      usuario_nombre,
      rol,
      ...params,
    })
  } catch {
    // Silent — la auditoría nunca debe romper el flujo principal
  }
}
