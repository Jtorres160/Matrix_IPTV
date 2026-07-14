import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './supreme_layout.jsx'
import { GlobalPlayerProvider } from './providers/GlobalPlayerProvider.jsx'
import { ToastProvider } from './providers/ToastProvider.jsx'
import ToastLayer from './components/ToastLayer.jsx'

const root = createRoot(document.getElementById('root'))
root.render(
  <ToastProvider>
    <GlobalPlayerProvider>
      <App />
      <ToastLayer />
    </GlobalPlayerProvider>
  </ToastProvider>
)

