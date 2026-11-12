import { Toast } from '@base-ui/react/toast'

// Spec: reemplazo de alert() nativo — manager global reutilizable desde
// cualquier componente cliente sin pasar por contexto/props. El provider
// real vive en components/ui/toaster.tsx, montado una sola vez en app/layout.tsx.
export const toastManager = Toast.createToastManager()

export const toast = {
  success: (message: string) => toastManager.add({ title: message, type: 'success' }),
  error: (message: string) => toastManager.add({ title: message, type: 'error' }),
  info: (message: string) => toastManager.add({ title: message, type: 'info' }),
}
