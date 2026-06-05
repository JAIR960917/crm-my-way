import { getRuntimeConfig } from "@/lib/runtime-config";

/** Reescreve URLs do Storage para o Supabase atual (útil após migração de domínio). */
export function resolveStoragePublicUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";

  const cfg = getRuntimeConfig();
  const base = (cfg.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return url;

  const [pathPart, ...queryParts] = url.split("?");
  const query = queryParts.length ? `?${queryParts.join("?")}` : "";

  // Qualquer host *.supabase.co legado → mesmo path no backend atual
  const legacyHost = pathPart.match(/^https?:\/\/[^/]*supabase\.co(\/.*)$/i);
  if (legacyHost) {
    return `${base}${legacyHost[1]}${query}`;
  }

  // URL absoluta de outro host self-hosted → reescreve só o host
  const storageOnOtherHost = pathPart.match(/^https?:\/\/[^/]+(\/storage\/v1\/.+)$/i);
  if (storageOnOtherHost && !pathPart.startsWith(base)) {
    return `${base}${storageOnOtherHost[1]}${query}`;
  }

  return url;
}
