'use client'

import { useSyncExternalStore } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

const noop = () => () => {}

function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false)
}

export function Toaster() {
  const { toasts } = useToast()
  const isClient = useIsClient()

  // The viewport is client-only UI. Rendering it only after hydration avoids
  // hydration mismatches caused by browser extensions (e.g. Trae) injecting
  // attributes like `data-trae-ref` into the server-rendered DOM.
  if (!isClient) return null

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
