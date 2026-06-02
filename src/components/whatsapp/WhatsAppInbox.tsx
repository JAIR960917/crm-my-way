import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw } from "lucide-react";

type ConversationRow = {
  id: string;
  instance_id: string | null;
  wa_id: string;
  contact_name: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  unread_count: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string | null;
  status: string | null;
  created_at: string;
};

export default function WhatsAppInbox() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const lastSelectedRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, instance_id, wa_id, contact_name, last_message_at, last_preview, unread_count")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (error) throw error;
    setConversations((data || []) as ConversationRow[]);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, conversation_id, direction, body, status, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      setMessages((data || []) as MessageRow[]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadConversations();
      if (selectedConversationId) await loadMessages(selectedConversationId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar inbox");
    } finally {
      setRefreshing(false);
    }
  }, [loadConversations, loadMessages, selectedConversationId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadConversations();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar inbox");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) return;
    if (lastSelectedRef.current === selectedConversationId) return;
    lastSelectedRef.current = selectedConversationId;
    void loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-inbox-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          void loadConversations();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const convId = (payload.new as { conversation_id?: string } | null)?.conversation_id;
          if (convId && convId === selectedConversationId) {
            void loadMessages(convId);
          } else {
            void loadConversations();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, loadMessages, selectedConversationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.contact_name || "").toLowerCase();
      const wa = (c.wa_id || "").toLowerCase();
      const preview = (c.last_preview || "").toLowerCase();
      return name.includes(q) || wa.includes(q) || preview.includes(q);
    });
  }, [conversations, search]);

  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-3 h-[70vh]">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nome, número ou mensagem…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Carregando inbox…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-0">
          <div className="md:col-span-1 rounded-md border min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b text-xs text-muted-foreground">
              {filtered.length} conversa(s)
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {filtered.map((c) => {
                  const selected = c.id === selectedConversationId;
                  const title = c.contact_name || c.wa_id;
                  const when = c.last_message_at
                    ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })
                    : "—";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedConversationId(c.id)}
                      className={[
                        "w-full text-left rounded-md border px-3 py-2 hover:bg-muted/40",
                        selected ? "bg-muted/60 border-primary/40" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium truncate">{title}</div>
                        {c.unread_count > 0 ? (
                          <Badge className="text-[10px]">{c.unread_count}</Badge>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.last_preview || "—"}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{when}</div>
                    </button>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    Nenhuma conversa encontrada
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div className="md:col-span-2 rounded-md border min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
              <div className="text-xs">
                <span className="text-muted-foreground">Conversa:</span>{" "}
                <span className="font-medium">{selectedConversation?.contact_name || selectedConversation?.wa_id || "—"}</span>
              </div>
              {messagesLoading ? <span className="text-[11px] text-muted-foreground">Carregando…</span> : null}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {!selectedConversationId ? (
                  <div className="text-sm text-muted-foreground text-center py-10">
                    Selecione uma conversa à esquerda
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-10">
                    Nenhuma mensagem nesta conversa
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.direction === "out";
                    return (
                      <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={[
                            "max-w-[85%] rounded-md px-3 py-2 border text-sm whitespace-pre-wrap",
                            mine ? "bg-primary text-primary-foreground border-primary/40" : "bg-muted/50",
                          ].join(" ")}
                        >
                          <div className="text-xs opacity-90">{m.body || "—"}</div>
                          <div className="text-[10px] opacity-80 mt-1 flex gap-2 justify-end">
                            <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                            {m.status ? <span>{m.status}</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

