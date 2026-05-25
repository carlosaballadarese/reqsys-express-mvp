import { NextResponse } from 'next/server'

const UNIDADES_DEFAULT = ['EA', 'UN', 'M', 'ML', 'KG', 'LT', 'GL', 'M2', 'M3', 'JGO', 'RLL', 'CJA', 'PAR', 'HRS']

export async function GET() {
  // Por ahora devolvemos la lista estática desde el servidor, 
  // facilitando su centralización y futura migración a base de datos.
  return NextResponse.json(UNIDADES_DEFAULT)
}
