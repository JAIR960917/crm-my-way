/** CORS restrito ao SITE_URL e origens extras (CORS_ALLOWED_ORIGINS). */

const DEFAULT_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-cron-secret",
  "x-bootstrap-secret",
].join(", ");

let cachedOrigins: string[] | null = null;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function getAllowedCorsOrigins(): string[] {
  if (cachedOrigins) return cachedOrigins;

  const origins = new Set<string>();
  const siteUrl = Deno.env.get("SITE_URL")?.trim();
  if (siteUrl) origins.add(normalizeOrigin(siteUrl));

  const extra = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  for (const part of extra.split(",")) {
    const o = normalizeOrigin(part);
    if (o) origins.add(o);
  }

  if (Deno.env.get("CORS_ALLOW_LOCALHOST") !== "false") {
    for (const port of ["5173", "8080", "4173"]) {
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }

  cachedOrigins = [...origins];
  return cachedOrigins;
}

export function resolveCorsOrigin(req: Request): string | null {
  const allowed = getAllowedCorsOrigins();
  const requestOrigin = req.headers.get("Origin");

  if (requestOrigin) {
    const normalized = normalizeOrigin(requestOrigin);
    if (allowed.some((o) => normalizeOrigin(o) === normalized)) {
      return requestOrigin;
    }
    console.warn(
      "[cors] origem rejeitada:",
      requestOrigin,
      "— permitidas:",
      allowed.join(", ") || "(nenhuma; defina SITE_URL no .env da VPS)",
    );
    return null;
  }

  // Chamadas server-to-server (cron, Meta webhook) não enviam Origin.
  if (allowed.length > 0) return allowed[0];
  if (Deno.env.get("CORS_ALLOW_ANY") === "true") return "*";
  return null;
}

export function corsHeadersFor(
  req: Request,
  extraAllowHeaders: string[] = [],
): Record<string, string> {
  const origin = resolveCorsOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": [
      DEFAULT_ALLOW_HEADERS,
      ...extraAllowHeaders,
    ].filter(Boolean).join(", "),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    if (origin !== "*") {
      headers["Vary"] = "Origin";
    }
  }
  return headers;
}

/** @deprecated Use corsHeadersFor(req). */
export const internalCorsHeaders = {
  "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
