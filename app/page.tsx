import { Suspense } from 'react'
import HomeClient from '@/components/HomeClient'

export default function Home() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7280' }}>
          Loading…
        </div>
      }
    >
      <HomeClient />
    </Suspense>
  )
}
