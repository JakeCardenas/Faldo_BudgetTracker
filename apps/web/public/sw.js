// Faldo's service worker: only shows daily check-in notifications and opens the chat when one is tapped.
// It has no fetch handler, so it never caches or serves pages; the app always loads fresh.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Faldo", {
      body: data.body || "",
      icon: "/brand/faldo-panda-192.png",
      badge: "/brand/faldo-panda-192.png",
      tag: data.tag || "faldo",
      data: { url: data.url || "/assistant" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || "/assistant", self.location.origin)
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target.href)
          return client.focus()
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
