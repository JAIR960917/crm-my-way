export const SSOTICA_AUTO_SYNC_ENABLED_KEY = "ssotica_auto_sync_enabled";
export const SSOTICA_AUTO_SYNC_TIMES_KEY = "ssotica_auto_sync_times";
export const SSOTICA_AUTO_SYNC_LAST_TRIGGER_KEY = "ssotica_auto_sync_last_trigger";

export const DEFAULT_SSOTICA_AUTO_SYNC_TIMES = ["00:00", "06:00", "12:00", "18:00"];

export type SsoticaAutoSyncConfig = {
  enabled: boolean;
  times: string[];
  lastTrigger: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export function getBrasiliaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${hour}:${minute}`,
  };
}

export function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseSsoticaAutoSyncTimes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_SSOTICA_AUTO_SYNC_TIMES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_SSOTICA_AUTO_SYNC_TIMES];
    const normalized = parsed
      .map((item) => (typeof item === "string" ? normalizeTimeInput(item) : null))
      .filter((item): item is string => !!item);
    const unique = Array.from(new Set(normalized)).sort();
    return unique.length > 0 ? unique : [...DEFAULT_SSOTICA_AUTO_SYNC_TIMES];
  } catch {
    return [...DEFAULT_SSOTICA_AUTO_SYNC_TIMES];
  }
}

export function parseSsoticaAutoSyncConfig(
  enabledRaw: string | null | undefined,
  timesRaw: string | null | undefined,
  lastTriggerRaw: string | null | undefined,
): SsoticaAutoSyncConfig {
  return {
    enabled: enabledRaw === "true",
    times: parseSsoticaAutoSyncTimes(timesRaw),
    lastTrigger: lastTriggerRaw?.trim() || null,
  };
}

export async function loadSsoticaAutoSyncConfig(supabase: SupabaseAdmin): Promise<SsoticaAutoSyncConfig> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_key, setting_value")
    .in("setting_key", [
      SSOTICA_AUTO_SYNC_ENABLED_KEY,
      SSOTICA_AUTO_SYNC_TIMES_KEY,
      SSOTICA_AUTO_SYNC_LAST_TRIGGER_KEY,
    ]);

  const map = new Map((data || []).map((row: { setting_key: string; setting_value: string }) => [
    row.setting_key,
    row.setting_value,
  ]));

  return parseSsoticaAutoSyncConfig(
    map.get(SSOTICA_AUTO_SYNC_ENABLED_KEY),
    map.get(SSOTICA_AUTO_SYNC_TIMES_KEY),
    map.get(SSOTICA_AUTO_SYNC_LAST_TRIGGER_KEY),
  );
}

export async function setSsoticaAutoSyncLastTrigger(
  supabase: SupabaseAdmin,
  triggerKey: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("system_settings")
    .upsert(
      {
        setting_key: SSOTICA_AUTO_SYNC_LAST_TRIGGER_KEY,
        setting_value: triggerKey ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "setting_key" },
    );

  if (error) {
    console.warn(`[ssotica-sync][auto-sync] falha ao salvar last trigger: ${error.message}`);
  }
}

export function buildTriggerKey(dateKey: string, slot: string) {
  return `${dateKey}|${slot}`;
}

export function findMatchingSlot(times: string[], now = new Date()): string | null {
  const { hm } = getBrasiliaParts(now);
  return times.find((slot) => slot === hm) ?? null;
}

export function shouldStartScheduledCycle(
  config: SsoticaAutoSyncConfig,
  now = new Date(),
): { start: boolean; slot: string | null; triggerKey: string | null } {
  if (!config.enabled) return { start: false, slot: null, triggerKey: null };
  const slot = findMatchingSlot(config.times, now);
  if (!slot) return { start: false, slot: null, triggerKey: null };
  const { dateKey } = getBrasiliaParts(now);
  const triggerKey = buildTriggerKey(dateKey, slot);
  if (config.lastTrigger === triggerKey) return { start: false, slot, triggerKey };
  return { start: true, slot, triggerKey };
}
