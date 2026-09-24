import { NextResponse } from 'next/server'
import { anonClient } from '@/lib/supabase/clients'

// Spec: SC-002 — pasa a leer de la tabla `areas` (identidad pura) en vez de
// derivar valores únicos de coordinadores_area.area (texto legado). Devuelve
// {id, nombre} — el frontend selecciona por id, no por texto (Tarea 14).
export async function GET() {
  try {
    const { data, error } = await anonClient()
      .from('areas')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error fetching areas:', err)
    return NextResponse.json({ error: 'Error al obtener áreas' }, { status: 500 })
  }
}
