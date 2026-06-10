/** CRM — service worker só para push. Sem cache de páginas/JS (evita instabilidade após deploy). */
const SW_VERSION = "6";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "CRM Óticas Joonker", body: "Nova notificação" };

  try {
    data = event.data?.json() ?? data;
  } catch {
    // no-op
  }

  const options = {
    body: data.body || "Nova notificação",
    icon: data.icon || "/pwa-192x192.png",
    badge: data.badge || "/pwa-192x192.png",
    vibrate: [200, 100, 200],
    data: data.data || { url: "/" },
    actions: [{ action: "open", title: "Abrir" }],
  };

  event.respondWith(
    self.registration.showNotification(data.title || "CRM Óticas Joonker", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    }),
  );
});
