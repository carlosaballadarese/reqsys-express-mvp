'use client'

import { Toast } from '@base-ui/react/toast'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { toastManager } from '@/lib/toast'

// Spec: estilos propios en vez de la librería (sonner, etc.) — sin
// dependencia nueva (@base-ui/react ya estaba instalado para Button) y con
// control total sobre la paleta teal/dorado del proyecto.
const TIPO_ESTILO: Record<string, { borde: string; icono: React.ReactNode }> = {
  success: { borde: 'border-l-4 border-l-[#1a5252]', icono: <CheckCircle2 className="size-5 text-[#1a5252] shrink-0" /> },
  error:   { borde: 'border-l-4 border-l-red-600',    icono: <AlertCircle className="size-5 text-red-600 shrink-0" /> },
  info:    { borde: 'border-l-4 border-l-[#c9a840]',  icono: <Info className="size-5 text-[#c9a840] shrink-0" /> },
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return (
    <>
      {toasts.map((t) => {
        const estilo = TIPO_ESTILO[t.type ?? 'info'] ?? TIPO_ESTILO.info
        return (
          <Toast.Root
            key={t.id}
            toast={t}
            className={`${estilo.borde} bg-white rounded-lg shadow-lg border border-slate-200 p-3 pr-2 w-80 max-w-[90vw] flex items-start gap-2
              data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2
              data-[ending-style]:opacity-0 data-[ending-style]:translate-x-4
              transition-all duration-200`}
          >
            {estilo.icono}
            <Toast.Content className="flex-1 min-w-0">
              <Toast.Title className="text-sm font-medium text-slate-800" />
              <Toast.Description className="text-xs text-slate-500" />
            </Toast.Content>
            <Toast.Close
              aria-label="Cerrar notificación"
              className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </Toast.Close>
          </Toast.Root>
        )
      })}
    </>
  )
}

// Spec: montado una sola vez en app/layout.tsx — disponible en toda la app
// (páginas públicas incluidas), no solo en /compras.
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={4}>
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
