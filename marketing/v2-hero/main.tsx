import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GarageV2 } from './src/GarageV2'

// A bare host so the hero can be seen at the width it was designed for. Drop
// <GarageV2 /> into a real page the same way; it brings its own CSS.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 40, maxWidth: 840, margin: '0 auto' }}>
      <GarageV2 />
    </div>
  </StrictMode>,
)
