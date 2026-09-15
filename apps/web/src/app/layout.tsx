import type { Metadata, Viewport } from "next"
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { Splash } from "@/components/brand/splash"
import { Providers } from "./providers"
import "./globals.css"

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

const SPLASH_GATE = `(function(){try{var d=document.documentElement;var n=performance.getEntriesByType("navigation")[0];var t=n&&n.type;if(t==="reload"||t==="back_forward"||sessionStorage.getItem("faldo:opened")){d.dataset.splash="skip"}else{sessionStorage.setItem("faldo:opened","1")}}catch(e){}})()`

export const metadata: Metadata = {
  title: { default: "Faldo", template: "%s · Faldo" },
  description: "Your personal money companion. Track spending, plan ahead and grow your savings.",
  applicationName: "Faldo",
  appleWebApp: { capable: true, title: "Faldo", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d110e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />
      </head>
      <body className="min-h-dvh">
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
