/**
 * CRM — service worker: push notifications + cache do app shell para uso offline.
 *
 * Estratégia network-first: enquanto há internet, sempre busca a versão mais
 * nova (nunca serve HTML/JS desatualizado). O cache só entra em ação quando a
 * rede falha — nesse momento contém o último conjunto consistente
 * (index.html + assets) buscado com sucesso, permitindo abrir o app offline
 * com a sessão salva em localStorage.
 *
 * Bump CACHE_VERSION para forçar limpeza total do cache do shell.
 */
const CACHE_VERSION = "1";
const SHELL_CACHE = `crm-shell-v${CACHE_VERSION}`;
const APP_SHELL_URL = "/index.html";

/**
 * Pré-cacheia o shell (index.html + JS/CSS referenciados) assim que o SW
 * instala — não espera o usuário navegar pra popular o cache. Sem isso, toda
 * vez que uma versão nova é publicada, existe uma janela em que o cache
 * antigo já foi descartado (no activate) mas o novo ainda não foi
 * preenchido — se o aparelho ficar offline bem nessa janela, não há nada
 * pra servir e o app não abre (ERR_FAILED), mesmo já tendo aberto antes.
 */
async function precacheShell() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const response = await fetch(APP_SHELL_URL, { cache: "no-store" });
    if (!response || !response.ok) return;
    const html = await response.clone().text();
    await cache.put(APP_SHELL_URL, response.clone());
    const assetUrls = Array.from(html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)).map((m) => m[0]);
    await Promise.all(
      assetUrls.map(async (url) => {
        try {
          const assetResponse = await fetch(url, { cache: "no-store" });
          if (assetResponse && assetResponse.ok) await cache.put(url, assetResponse.clone());
        } catch {
          // sem rede pra esse asset agora — fica pra próxima navegação cachear
        }
      }),
    );
  } catch {
    // sem internet no install — fica sem precache; cache antigo (se houver) continua servindo
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([self.skipWaiting(), precacheShell()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("crm-shell-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiPath(pathname) {
  return /^\/(rest|auth|functions|realtime|storage)\//.test(pathname);
}

/** Remove do cache assets antigos (hash anterior) que não são mais referenciados pelo shell atual. */
async function pruneOrphanedAssets(cache, html) {
  const referenced = new Set(
    Array.from(html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)).map((m) => m[0]),
  );
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => {
        const path = new URL(request.url).pathname;
        return path.startsWith("/assets/") && !referenced.has(path);
      })
      .map((request) => cache.delete(request)),
  );
}

// Internet lenta (não offline de verdade) faz o fetch ficar pendente pra
// sempre — sem nunca cair no catch(), o app trava na tela de carregamento.
// Por isso a estratégia agora é "network-first com prazo": se a rede não
// responder em NETWORK_TIMEOUT_MS, serve a versão em cache imediatamente
// (deixando o fetch real continuar em segundo plano pra atualizar o cache).
const NETWORK_TIMEOUT_MS = 4000;

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

/**
 * Resposta amigável pra quando não há rede E não há nada em cache (ex.:
 * primeiro acesso, nunca abriu este aparelho online). Rejeitar a promise de
 * respondWith() faz o Chrome mostrar "ERR_FAILED" (tela genérica e confusa);
 * devolver uma Response de verdade mostra uma mensagem explicando o motivo.
 */
function offlineFallbackResponse() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
      `<title>Sem conexão</title></head>` +
      `<body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;` +
      `height:100vh;background:#0f172a;color:#cbd5e1;font-family:system-ui,-apple-system,sans-serif;` +
      `text-align:center;padding:24px;gap:12px;">` +
      `<p style="font-size:15px;font-weight:600;margin:0;">Sem conexão com a internet</p>` +
      `<p style="font-size:13px;color:#94a3b8;margin:0;max-width:300px;">` +
      `Este aparelho ainda não abriu o CRM com internet, então não há nada salvo pra abrir offline. ` +
      `Conecte-se à internet e abra uma vez pra liberar o uso offline depois.</p>` +
      `<button onclick="location.reload()" style="margin-top:8px;background:#e11d48;color:#fff;border:none;` +
      `border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;">Tentar novamente</button>` +
      `</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const networkPromise = fetch(request).then(async (response) => {
    if (response && response.ok) {
      const html = await response.clone().text();
      await cache.put(APP_SHELL_URL, response.clone());
      await pruneOrphanedAssets(cache, html);
    }
    return response;
  });

  try {
    return await Promise.race([networkPromise, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    const cached = await cache.match(APP_SHELL_URL);
    if (cached) return cached;
    // Sem cache ainda (primeiro acesso) — só resta esperar a rede de verdade.
    try {
      return await networkPromise;
    } catch {
      return offlineFallbackResponse();
    }
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const networkPromise = fetch(request).then(async (response) => {
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  try {
    return await Promise.race([networkPromise, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      return await networkPromise;
    } catch {
      throw new Error("offline-no-asset");
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiPath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(networkFirstAsset(request));
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------
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
