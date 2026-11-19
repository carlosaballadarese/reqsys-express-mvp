'use client'

export const dynamic = 'force-dynamic'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// Spec: HU-033 CA-03 — reporte exportable de productos bajo el mínimo.
export default function StockBajoMinimoPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Stock Bajo Mínimo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Descarga un reporte Excel con los productos cuyo saldo actual está por debajo de su
            Stock Mínimo configurado.
          </p>
          <Button onClick={() => { window.location.href = '/api/compras/bodega/reportes/stock-bajo-minimo/excel' }}>
            ⬇ Exportar a Excel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
