/** Phone photos are big; Faldo only needs a readable one. Downsize and re-encode as JPEG before sending. */
export interface Photo {
  media_type: "image/jpeg"
  data: string
  /** For showing it in the chat while the answer streams. */
  preview: string
}

const MAX_SIDE = 1600
const QUALITY = 0.82

export async function readPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Couldn't read that photo.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const preview = canvas.toDataURL("image/jpeg", QUALITY)
  const data = preview.slice(preview.indexOf(",") + 1)
  if (data.length > 3_000_000) throw new Error("That photo is too big. Try a smaller one.")
  return { media_type: "image/jpeg", data, preview }
}
