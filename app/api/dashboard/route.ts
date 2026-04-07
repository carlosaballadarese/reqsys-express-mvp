import { NextRequest, NextResponse } from 'next/server'
import { anonClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  try {
    const year = req.nextUrl.searchParams.get('year')
    const p_year = year ? parseInt(year) : null

    const { data, error } = await anonClient().rpc('get_dashboard_data', { p_year })

    if (error) {
      console.error('RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
