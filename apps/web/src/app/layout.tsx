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
    { media: "(prefers-color-scheme: light)", color: "#f4f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android's keyboard shrinks the layout like iOS does, so the chat's composer rides above it.
  interactiveWidget: "resizes-content",
}

/** "Reduce motion" from Settings, applied before first paint (see lib/motion). */
const MOTION = `try{if(localStorage.getItem("faldo:motion")==="reduced")document.documentElement.dataset.motion="reduced"}catch(e){}`

const IOS_EDGE = `if(/iP(hone|od|ad)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1))document.documentElement.classList.add("ios")`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior: in-page scrolling stays smooth, but a new page starts at its top at once.
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${jakarta.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />
        {/* iPhone and iPad blur the top ~40pt under the status bar (iOS 26 scroll edge effect); mark them before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: IOS_EDGE }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION }} />
      </head>
      <body className="min-h-dvh">
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
