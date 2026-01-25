import type { Metadata, Viewport } from 'next'
import './globals.css'
import { RuntimeCapabilitiesBanner } from '@/components/RuntimeCapabilitiesBanner'
import { EntitlementProvider } from '@/contexts/EntitlementContext'
import { CapabilityFactsProvider } from '@/contexts/CapabilityFactsContext'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Chess Coach',
  description: 'Chess analysis and coaching with Stockfish',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <RuntimeCapabilitiesBanner />
        <CapabilityFactsProvider>
          <EntitlementProvider>
            {children}
          </EntitlementProvider>
        </CapabilityFactsProvider>
      </body>
    </html>
  )
}
