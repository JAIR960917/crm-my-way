import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ExternalLink, Loader2, UserPlus } from "lucide-react";
import { normalizeLeadData, resolveLeadIdentity } from "@/lib/leadIdentity";

type ConversationRef = {
  id: string;
  wa_id: string;
  contact_name: string | null;
  phone_display: string | null;
  card_id: string | null;
};

type Company = { id: string; name: string };

type FormField = {
  id: string;
  is_name_field?: boolean;
  is_phone_field?: boolean;
};

type LinkedLead = {
  id: string;
  nome: string;
  empresaNome: string | null;
};

type Props = {
  conversation: ConversationRef;
  formatPhone: (raw: string) => string;
  onLinked: (conversationId: string, patch: { card_id: string; contact_name: string | null; module: string }) => void;
};

function phoneDigits(conversation: ConversationRef) {
  return (conversation.phone_display || conversation.wa_id || "").replace(/\D/g, "");
}

export default function WhatsAppCreateLeadPanel({ conversation, formatPhone, onLinked }: Props) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [linkedLead, setLinkedLead] = useState<LinkedLead | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);

  const [companyId, setCompanyId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const displayPhone = formatPhone(conversation.phone_display || conversation.wa_id);
  const digits = phoneDigits(conversation);

  const loadMeta = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMeta(true);
    try {
      const [{ data: myProfile }, { data: managerCos }, { data: ff }] = await Promise.all([
        supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("manager_companies").select("company_id").eq("user_id", user.id),
        supabase.from("crm_form_fields").select("id, is_name_field, is_phone_field").order("position"),
      ]);

      let allowed: Company[] = [];
      if (isAdmin) {
        const { data: all } = await supabase.from("companies").select("id, name").order("name");
        allowed = (all || []) as Company[];
      } else {
        const ids = new Set<string>();
        if (myProfile?.company_id) ids.add(myProfile.company_id);
        (managerCos || []).forEach((mc: { company_id?: string }) => {
          if (mc.company_id) ids.add(mc.company_id);
        });
        if (ids.size > 0) {
          const { data: filtered } = await supabase
            .from("companies")
            .select("id, name")
            .in("id", Array.from(ids))
            .order("name");
          allowed = (filtered || []) as Company[];
        }
      }
      setCompanies(allowed);
      setFields((ff || []) as FormField[]);
      if (allowed.length === 1) setCompanyId(allowed[0].id);
    } catch {
      toast.error("Não foi possível carregar empresas para o cadastro.");
    } finally {
      setLoadingMeta(false);
    }
  }, [user?.id, isAdmin]);

  const loadLinkedLead = useCallback(async (leadId: string) => {
    setLoadingLead(true);
    try {
      const { data, error } = await supabase.from("crm_leads").select("id, data").eq("id", leadId).maybeSingle();
      if (error || !data) {
        setLinkedLead({ id: leadId, nome: "Lead vinculado", empresaNome: null });
        return;
      }
      const d = (data.data || {}) as Record<string, unknown>;
      const nome =
        resolveLeadIdentity(d, fields).nome ||
        String(d.nome_lead || d.nome || "Lead");
      const empresaNome = typeof d.empresa_nome === "string" ? d.empresa_nome : null;
      setLinkedLead({ id: leadId, nome, empresaNome });
    } finally {
      setLoadingLead(false);
    }
  }, [fields]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setLeadName(conversation.contact_name?.trim() || "");
    setObservacao("");
    if (!conversation.card_id) {
      setLinkedLead(null);
      return;
    }
    loadLinkedLead(conversation.card_id);
  }, [conversation.id, conversation.card_id, conversation.contact_name, loadLinkedLead]);

  const selectedCompanyName = useMemo(
    () => companies.find((c) => c.id === companyId)?.name || "",
    [companies, companyId],
  );

  const handleCreate = async () => {
    if (!user?.id) {
      toast.error("Faça login para cadastrar o lead.");
      return;
    }
    if (!companyId) {
      toast.error("Selecione a empresa do lead.");
      return;
    }
    const name = leadName.trim();
    if (!name) {
      toast.error("Informe o nome do lead.");
      return;
    }
    if (digits.length < 8) {
      toast.error("Telefone da conversa inválido.");
      return;
    }

    const nameField = fields.find((f) => f.is_name_field);
    const phoneField = fields.find((f) => f.is_phone_field);
    if (!nameField || !phoneField) {
      toast.error("Configure os campos de nome e telefone no formulário de leads.");
      return;
    }

    setSaving(true);
    try {
      const { data: dup } = await supabase.rpc("find_lead_by_phone", { _phone: digits });
      const row = Array.isArray(dup) ? dup[0] : null;
      if (row?.lead_id) {
        const owner = row.owner_name || "outro vendedor";
        toast.error(
          row.is_mine
            ? "Já existe um lead com este telefone. Abra-o na tela de leads."
            : `Telefone já cadastrado com ${owner}.`,
        );
        setSaving(false);
        return;
      }

      const baseData: Record<string, unknown> = {
        [`field_${nameField.id}`]: name,
        [`field_${phoneField.id}`]: digits,
        empresa_id: companyId,
        empresa_nome: selectedCompanyName,
        origem_whatsapp: true,
        whatsapp_wa_id: conversation.wa_id,
      };
      if (observacao.trim()) baseData.observacao = observacao.trim();

      const finalData = normalizeLeadData(baseData as Record<string, any>, fields);

      const { data: inserted, error } = await supabase
        .from("crm_leads")
        .insert({
          data: finalData,
          status: "novo",
          assigned_to: user.id,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !inserted) {
        toast.error(error?.message || "Erro ao criar lead.");
        return;
      }

      const leadId = inserted.id;
      const noteBody = observacao.trim()
        ? `📱 WhatsApp Inbox — ${observacao.trim()}`
        : "📱 Lead cadastrado a partir do WhatsApp Inbox.";

      await supabase.from("crm_lead_notes").insert({
        lead_id: leadId,
        user_id: user.id,
        content: noteBody,
      });

      const { error: linkErr } = await supabase
        .from("whatsapp_conversations")
        .update({
          card_id: leadId,
          module: "leads",
          contact_name: name,
        })
        .eq("id", conversation.id);

      if (linkErr) {
        toast.warning("Lead criado, mas não foi possível vincular a conversa: " + linkErr.message);
      } else {
        onLinked(conversation.id, { card_id: leadId, contact_name: name, module: "leads" });
        toast.success("Lead cadastrado e vinculado à conversa.");
      }

      setLinkedLead({ id: leadId, nome: name, empresaNome: selectedCompanyName || null });
    } catch {
      toast.error("Erro inesperado ao cadastrar lead.");
    } finally {
      setSaving(false);
    }
  };

  if (conversation.card_id) {
    return (
      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead no CRM</p>
        {loadingLead ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <>
            <p className="font-semibold leading-snug">{linkedLead?.nome || "Lead vinculado"}</p>
            {linkedLead?.empresaNome ? (
              <p className="text-xs text-muted-foreground">Empresa: {linkedLead.empresaNome}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => navigate(`/?edit=${conversation.card_id}`)}
            >
              <ExternalLink className="h-4 w-4" />
              Abrir na tela de leads
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastrar lead</p>

      {loadingMeta ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : companies.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Nenhuma empresa disponível para seu usuário. Peça ao administrador para vincular sua conta a uma empresa.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nome do lead</Label>
            <Input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Nome do contato"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Telefone (WhatsApp)</Label>
            <Input value={displayPhone} readOnly disabled className="h-9 font-medium" />
            <p className="text-[10px] text-muted-foreground">Preenchido automaticamente a partir da conversa.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação para continuidade</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Contexto do atendimento, pedido do cliente, próximo passo…"
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <Button
            type="button"
            className="w-full gap-2"
            disabled={saving || !companyId || !leadName.trim()}
            onClick={handleCreate}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Adicionar lead
          </Button>
        </>
      )}
    </div>
  );
}
