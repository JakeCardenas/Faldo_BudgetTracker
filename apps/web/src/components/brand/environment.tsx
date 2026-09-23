/**
 * Faldo's Home environments: his panda habitat by default, then landmarks across Asia as rewards. This file
 * holds what server and client code share: each environment's sky (the band's background) and the colour at the top
 * of it, for the strip under the iPhone status bar. The scenery drawn on the sky lives in `scenery.tsx`.
 */

export interface Sky {
  /** The very top of the band: deep enough for white text, and the status bar's colour. */
  top: string
  /** Where the sky meets the land. */
  horizon: string
  /** The soft glow of the sun, and where it sits. */
  sun: string
  sunAt: string
  /** Clouds take the sky's light: white by day, peach at dawn, lilac at dusk. */
  cloud: string
  cloudShade: string
}

export const SKIES: Record<string, Sky> = {
  // Faldo's home: the pixel-art bamboo valley (public/brand/scenes/bamboo-valley.webp).
  // (The painting covers it; this is what shows while it loads, and the top matches its shaded top.)
  meadow: { top: "#518375", horizon: "#a3d2bf", sun: "rgb(255 248 220 / 0.3)", sunAt: "70% 24%", cloud: "#f6faf4", cloudShade: "#d3e3d6" },
  // Mayon Volcano, Philippines, at sunrise.
  sunrise: { top: "#2b5a95", horizon: "#fcd7ae", sun: "rgb(255 222 180 / 0.55)", sunAt: "74% 58%", cloud: "#fff4ea", cloudShade: "#f1cfbd" },
  // The Banaue Rice Terraces, Philippines, in morning mist.
  terraces: { top: "#27627d", horizon: "#dcefe8", sun: "rgb(255 250 230 / 0.35)", sunAt: "80% 32%", cloud: "#ffffff", cloudShade: "#d3e5e2" },
  // Marina Bay, Singapore, on a bright tropical day.
  lagoon: { top: "#1966ac", horizon: "#bbe5f3", sun: "rgb(255 252 220 / 0.4)", sunAt: "82% 30%", cloud: "#ffffff", cloudShade: "#d2e7f2" },
  // Mount Fuji, Japan, on a clear spring morning.
  hills: { top: "#2c65a1", horizon: "#eef3f6", sun: "rgb(255 250 240 / 0.35)", sunAt: "84% 28%", cloud: "#ffffff", cloudShade: "#dde6ee" },
  // Wat Arun, Thailand, at sunset over the river.
  bay_sunset: { top: "#383a77", horizon: "#f8a45c", sun: "rgb(255 196 130 / 0.55)", sunAt: "64% 66%", cloud: "#fbd4c4", cloudShade: "#c998a8" },
  // Gyeongbokgung, Korea, on an autumn afternoon.
  seoul: { top: "#2a6299", horizon: "#f2e2c4", sun: "rgb(255 238 200 / 0.45)", sunAt: "80% 40%", cloud: "#fffaf2", cloudShade: "#e9dcc6" },
  // Taipei 101, Taiwan, at night.
  night_market: { top: "#0b1332", horizon: "#33487d", sun: "rgb(200 214 255 / 0.18)", sunAt: "78% 26%", cloud: "#7f93bd", cloudShade: "#5e7099" },
}

export function skyFor(id?: string | null): Sky {
  return SKIES[id ?? "meadow"] ?? SKIES.meadow
}

/** The colour at the very top of the band, for the strip under the iPhone status bar (see StatusBarTint). */
export function bandTint(id?: string | null) {
  return skyFor(id).top
}

/** The band's sky: deep at the top, light at the horizon, with a soft sun glow. */
export function environmentStyle(id?: string | null): React.CSSProperties {
  const sky = skyFor(id)
  return {
    backgroundImage: [
      `radial-gradient(circle at ${sky.sunAt}, ${sky.sun} 0, transparent 15rem)`,
      `linear-gradient(180deg, ${sky.top} 0%, color-mix(in oklab, ${sky.top} 55%, ${sky.horizon}) 50%, ${sky.horizon} 100%)`,
    ].join(","),
  }
}

/** The light mint environment used on sign-in: pass with the `faldo-env` class, which handles dark mode. */
export const LIGHT_ENVIRONMENT = {
  "--env-l1": "#dbebdf", "--env-l2": "#eef5ef", "--env-l3": "#fbfcfa",
  "--env-d1": "#16301f", "--env-d2": "#0f1c14", "--env-d3": "#0c120e",
} as React.CSSProperties
