/**
 * Faldo's colour set for categories and charts: d3's Spectral scheme, deepened where it runs pale so every colour
 * holds up on white and on dark. Neighbouring colours blend into each other, so several at once read as one set
 * rather than a rainbow. The API gives each default category one of these (services/categories.py); anything the
 * app colours itself, like the quick actions on Home, picks from the same names. Faldo's green stays the brand.
 */
export const PALETTE = {
  coral: "#F0643D",
  apricot: "#F59B4C",
  gold: "#E3B63E",
  lime: "#A5C956",
  green: "#6DBE7B",
  teal: "#3FAE95",
  lagoon: "#2E97A8",
  blue: "#3380BE",
  indigo: "#5A5BAA",
  violet: "#7B4F9E",
  berry: "#A8174D",
  raspberry: "#D53E4F",
  rose: "#E3739B",
  slate: "#6E7A74",
  stone: "#A3ABA5",
} as const
