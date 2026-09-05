import React from 'react'
import ReactDOM from 'react-dom/client'
// Installs `window.api`. Imported first so the global exists before any
// component effect can reach for it.
import api from './services/api'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Electron showed the window on `ready-to-show`. The Tauri window starts
// hidden, so the equivalent moment is after React's first paint.
requestAnimationFrame(() => {
  api.frontendReady().catch((error) => console.error('Failed to reveal window:', error))
})
