import { NextResponse } from 'next/server'
import { anonClient } from '@/lib/supabase/clients'

export async function GET() {
  try {
    const { data, error } = await anonClient()
      .from('coordinadores_area')
      .select('area')
      .order('area')

    if (error) throw error

    // Extraer solo los nombres de las áreas y eliminar duplicados (aunque deberían ser únicos)
    const areas = Array.from(new Set(data.map(item => item.area)))
    
    return NextResponse.json(areas)
  } catch (err) {
    console.error('Error fetching areas:', err)
    return NextResponse.json({ error: 'Error al obtener áreas' }, { status: 500 })
  }
}
