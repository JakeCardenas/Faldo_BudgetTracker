"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

/**
 * Faldo's daily check-in on this phone, as a web push notification. On iPhone this only works in the app added to
 * the Home Screen (iOS 16.4 and later); the switch explains that when it isn't available.
 */
export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

export function needsHomeScreen() {
  if (typeof window === "undefined") return false
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone
  return ios && !standalone
}

function keyBytes(base64url: string) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/")
  return registration ? registration.pushManager.getSubscription() : null
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error(needsHomeScreen() ? "Add Faldo to your Home Screen first, then turn this on there." : "This browser can't show notifications.")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notifications are off for Faldo. Turn them on in your phone's settings.")
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  await navigator.serviceWorker.ready
  const { public_key } = await api.get<{ public_key: string }>("/push/key")
  const subscription = (await registration.pushManager.getSubscription())
    ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) }))
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api.post("/push/subscriptions", { endpoint: json.endpoint, keys: json.keys })
  await api.post("/push/test")
}

export async function disablePush(): Promise<void> {
  const subscription = pushSupported() ? await currentSubscription() : null
  if (subscription) {
    await api.post("/push/unsubscribe", { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }
}

export function usePushEnabled(): [boolean | null, (on: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean | null>(() => (pushSupported() ? null : false))
  useEffect(() => {
    if (!pushSupported()) return
    currentSubscription().then((s) => setEnabled(Boolean(s) && Notification.permission === "granted")).catch(() => setEnabled(false))
  }, [])
  return [enabled, setEnabled]
}
