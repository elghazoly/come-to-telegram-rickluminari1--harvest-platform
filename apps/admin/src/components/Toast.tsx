'use client'
import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'loading'
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    if (type === 'loading') return
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [type, onClose])

  const styles = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    loading: 'bg-blue-700',
  }

  const icons = {
    success: '✅',
    error:   '❌',
    loading: '⏳',
  }

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] ${styles[type]} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold animate-fade-in`}>
      <span>{icons[type]}</span>
      <span>{message}</span>
      {type !== 'loading' && (
        <button onClick={onClose} className="mr-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
      )}
    </div>
  )
}

// Hook for easy toast management
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success'|'error'|'loading' } | null>(null)

  const show = (message: string, type: 'success'|'error'|'loading' = 'success') => {
    setToast({ message, type })
  }

  const hide = () => setToast(null)

  const ToastComponent = toast ? <Toast message={toast.message} type={toast.type} onClose={hide} /> : null

  return { show, hide, ToastComponent }
}
