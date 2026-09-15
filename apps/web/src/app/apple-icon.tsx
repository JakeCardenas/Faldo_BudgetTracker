import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#4a7f52" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path d="M22 46V19h22" stroke="#f5fbf3" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M22 32.5h15" stroke="#b9dca9" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    size,
  )
}
