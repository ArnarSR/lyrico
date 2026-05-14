import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAnalytics } from './lib/analytics'
import App from './App.tsx'
import { UpdateBanner } from './components/UpdateBanner'

initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)
