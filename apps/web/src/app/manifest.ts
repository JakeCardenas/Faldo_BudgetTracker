import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Faldo",
    short_name: "Faldo",
    description: "Your personal money companion.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4f1",
    theme_color: "#5d8a5e",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add expense", url: "/?add=expense" },
      { name: "Talk to Faldo", url: "/assistant" },
      { name: "History", url: "/transactions" },
    ],
  }
}
