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
    theme_color: "#4a7f52",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Add expense", url: "/?add=expense" },
      { name: "Talk to Faldo", url: "/assistant" },
      { name: "History", url: "/transactions" },
    ],
  }
}
