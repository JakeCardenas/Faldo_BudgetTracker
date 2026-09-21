import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { Splash } from "@/components/brand/splash"
import { Providers } from "./providers"
import "./globals.css"

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] })
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

const SPLASH_GATE = `(function(){try{var d=document.documentElement;var n=performance.getEntriesByType("navigation")[0];var t=n&&n.type;if(t==="reload"||t==="back_forward"||sessionStorage.getItem("faldo:opened")){d.dataset.splash="skip"}else{sessionStorage.setItem("faldo:opened","1")}}catch(e){}})()`

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"
const description = "Your personal money companion. Track spending, plan ahead and grow your savings."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Faldo", template: "%s · Faldo" },
  description,
  openGraph: {
    type: "website",
    siteName: "Faldo",
    title: "Faldo · Your money, made simple",
    description,
    images: [{ url: "/brand/faldo-panda-1024.png", width: 1024, height: 1024, alt: "Faldo app icon" }],
  },
  twitter: { card: "summary", title: "Faldo · Your money, made simple", description, images: ["/brand/faldo-panda-1024.png"] },
  applicationName: "Faldo",
  appleWebApp: { capable: true, title: "Faldo", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${jakarta.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
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
