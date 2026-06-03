export type AppRuntimeConfig = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  /** Desliga realtime nos quadros (leads/cobrança) para aliviar a VPS. */
  disableRealtime?: boolean;
  /** Inbox WhatsApp: avisos de mensagem nova (default: ligado mesmo com disableRealtime). */
  whatsappInboxRealtime?: boolean;
};

export function getRuntimeConfig(): AppRuntimeConfig {
  return ((window as Window & { __CRM_RUNTIME_CONFIG__?: AppRuntimeConfig }).__CRM_RUNTIME_CONFIG__ ?? {});
}

export function isRealtimeEnabled(): boolean {
  return getRuntimeConfig().disableRealtime !== true;
}

/** Realtime + notificações do Inbox WhatsApp (independente do kanban). */
export function isWhatsAppInboxRealtimeEnabled(): boolean {
  const cfg = getRuntimeConfig();
  if (cfg.whatsappInboxRealtime === false) return false;
  if (cfg.whatsappInboxRealtime === true) return true;
  return isRealtimeEnabled();
}
