/**
 * Este arquivo (/sw.js) existiu apenas para "desinstalar" um service worker
 * legado em dispositivos antigos — o service worker real do app hoje é
 * /service-worker.js (ver src/lib/pwaBootstrap.ts).
 *
 * A versão anterior deste arquivo, ao reativar, apagava TODOS os caches e
 * forçava a navegação (reload) de toda aba aberta — incluindo usuários que
 * estavam no meio do preenchimento de um formulário OFFLINE, derrubando o
 * progresso deles. Esta versão apenas se desregistra silenciosamente, sem
 * apagar cache nem recarregar a página do usuário.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister());
});