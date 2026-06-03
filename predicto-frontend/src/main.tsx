import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n' // i18n must initialize before any component
import Router from './router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#010102',
          color: '#666',
          fontFamily: 'Inter, sans-serif',
          fontSize: 14
        }}>
          Loading…
        </div>
      }>
        <Router />
      </React.Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
)
