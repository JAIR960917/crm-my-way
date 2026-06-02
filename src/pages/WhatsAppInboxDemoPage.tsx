/**
 * Inbox WhatsApp (API oficial Meta).
 * Dados reais: whatsapp_conversations / whatsapp_messages + realtime.
 */
import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
export default function WhatsAppInboxDemoPage() {
  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-4rem)] flex-col gap-3 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Inbox WhatsApp</strong> — API oficial (Meta). Mensagens chegam via webhook e atualizam em tempo real.
          </span>
          <Badge variant="outline" className="ml-auto gap-1 border-emerald-600/50 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" />
            API Oficial Meta
          </Badge>
        </div>

        <WhatsAppInbox />
      </div>
    </AppLayout>
  );
}
