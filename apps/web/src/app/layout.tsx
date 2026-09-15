import type { Metadata, Viewport } from "next"
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Faldo", template: "%s · Faldo" },
  description: "Your AI financial copilot.",
}

export const viewport: Viewport = {
  themeColor: "#f1f4ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
