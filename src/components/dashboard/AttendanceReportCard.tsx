import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { isRealtimeEnabled } from "@/lib/runtime-config";
import {
  Users,
  Phone,
  PhoneOff,
  CalendarCheck,
  CalendarX,
  Calendar as CalIcon,
  Building2,
  ChevronDown,
  X,
  ThumbsUp,
  CalendarClock,
} from "lucide-react";
import {
  fetchAttendanceReport,
  type AttendanceSellerRow,
  type AttendanceProfile,
  type AttendanceCompany,
  type AttendanceReportTotals,
} from "@/lib/attendanceReport";

export type AttendanceReportMode = "admin" | "gerente" | "vendedor";

type SellerRow = AttendanceSellerRow;
type Profile = AttendanceProfile;
type Company = AttendanceCompany;

const ALL = "__all__";

const formatDateForInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

type Props = {
  mode: AttendanceReportMode;
  userId: string;
};

export default function AttendanceReportCard({ mode, userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allRows, setAllRows] = useState<SellerRow[]>([]);
  const [uniqueTotals, setUniqueTotals] = useState<AttendanceReportTotals | null>(null);
  const [vendedorIds, setVendedorIds] = useState<Set<string>>(new Set());
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<"day" | "range">("day");
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [endDate, setEndDate] = useState(formatDateForInput(new Date()));
  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const [sellerFilter, setSellerFilter] = useState<string[]>([]);

  const showCompanyFilter = mode === "admin";
  const showSellerFilter = mode === "admin" || mode === "gerente";
  const showSellerTable = mode !== "vendedor";

  useEffect(() => {
    if (mode !== "vendedor") return;
    setSellerFilter([userId]);
  }, [mode, userId]);

  useEffect(() => {
    if (mode !== "gerente") return;
    supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const cid = (data as { company_id?: string | null } | null)?.company_id;
        if (cid) {
          setMyCompanyId(cid);
          setCompanyFilter(cid);
        }
      });
  }, [mode, userId]);

  const fetchReport = async (startStr: string, endStr: string) => {
    const result = await fetchAttendanceReport(startStr, endStr);
    setProfiles(result.profiles);
    setCompanies(result.companies);
    setVendedorIds(result.vendedorIds);
    setAllRows(result.rows);
    setUniqueTotals(result.uniqueTotals);
  };

  useEffect(() => {
    setLoading(true);
    const start = dateMode === "day" ? selectedDate : startDate;
    const end = dateMode === "day" ? selectedDate : endDate;
    fetchReport(start, end).finally(() => setLoading(false));
  }, [dateMode, selectedDate, startDate, endDate, userId]);

  useEffect(() => {
    if (!isRealtimeEnabled()) return;
    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const start = dateMode === "day" ? selectedDate : startDate;
        const end = dateMode === "day" ? selectedDate : endDate;
        fetchReport(start, end);
      }, 400);
    };
    const channel = supabase
      .channel(`attendance-report-${mode}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_lead_notes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_renovacao_notes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "renovacao_activities" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_appointments" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mode, userId, dateMode, selectedDate, startDate, endDate]);

  useEffect(() => {
    if (showCompanyFilter) setSellerFilter([]);
  }, [companyFilter, showCompanyFilter]);

  const availableSellers = useMemo(() => {
    let list = profiles;
    if (mode === "gerente" && myCompanyId) {
      list = list.filter(
        (p) => p.company_id === myCompanyId && (p.user_id === userId || vendedorIds.has(p.user_id)),
      );
    } else if (companyFilter !== ALL) {
      list = list.filter((p) => p.company_id === companyFilter);
    }
    return list
      .map((p) => ({ user_id: p.user_id, full_name: p.full_name || "(sem nome)" }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [profiles, companyFilter, mode, myCompanyId, userId, vendedorIds]);

  const filteredRows = useMemo(() => {
    const filtered = allRows.filter((r) => {
      if (mode === "vendedor") return r.user_id === userId;
      if (mode === "gerente" && myCompanyId && r.company_id !== myCompanyId) return false;
      if (companyFilter !== ALL && r.company_id !== companyFilter) return false;
      if (sellerFilter.length > 0 && !sellerFilter.includes(r.user_id)) return false;
      return true;
    });

    if (mode === "gerente" && sellerFilter.length === 0) {
      const compById = new Map(companies.map((c) => [c.id, c.name]));
      const byId = new Map(filtered.map((r) => [r.user_id, r]));
      const merged = availableSellers
        .map((s) => {
          const existing = byId.get(s.user_id);
          if (existing) return existing;
          const p = profiles.find((x) => x.user_id === s.user_id);
          if (!p) return null;
          return {
            user_id: p.user_id,
            full_name: p.full_name || "(sem nome)",
            avatar_url: p.avatar_url,
            company_id: p.company_id,
            company_name: p.company_id ? compById.get(p.company_id) || "—" : "—",
            adicionados: 0,
            tratados: 0,
            naoAtenderam: 0,
            atenderam: 0,
            agendaram: 0,
            naoAgendaram: 0,
            agendamentos: 0,
          } satisfies SellerRow;
        })
        .filter((r): r is SellerRow => r !== null);
      return merged.sort((a, b) => b.tratados - a.tratados || a.full_name.localeCompare(b.full_name));
    }

    return filtered;
  }, [allRows, companyFilter, sellerFilter, mode, userId, myCompanyId, availableSellers, profiles, companies]);

  const reportTotals = useMemo(() => {
    const empty = {
      adicionados: 0,
      tratados: 0,
      naoAtenderam: 0,
      atenderam: 0,
      agendaram: 0,
      naoAgendaram: 0,
      agendamentos: 0,
    };
    if (sellerFilter.length === 1) {
      const row = filteredRows.find((r) => r.user_id === sellerFilter[0]);
      return row
        ? {
            adicionados: row.adicionados,
            tratados: row.tratados,
            naoAtenderam: row.naoAtenderam,
            atenderam: row.atenderam,
            agendaram: row.agendaram,
            naoAgendaram: row.naoAgendaram,
            agendamentos: row.agendamentos,
          }
        : empty;
    }
    const summed = filteredRows.reduce(
      (acc, r) => ({
        adicionados: acc.adicionados + r.adicionados,
        tratados: acc.tratados + r.tratados,
        naoAtenderam: acc.naoAtenderam + r.naoAtenderam,
        atenderam: acc.atenderam + r.atenderam,
        agendaram: acc.agendaram + r.agendaram,
        naoAgendaram: acc.naoAgendaram + r.naoAgendaram,
        agendamentos: acc.agendamentos + r.agendamentos,
      }),
      empty,
    );
    const useUniqueLeadTotals =
      uniqueTotals &&
      sellerFilter.length === 0 &&
      (mode !== "admin" || companyFilter === ALL);
    if (!useUniqueLeadTotals) return summed;
    return {
      ...summed,
      adicionados: uniqueTotals.adicionados,
      tratados: uniqueTotals.tratados,
      naoAtenderam: uniqueTotals.naoAtenderam,
      atenderam: uniqueTotals.atenderam,
      agendaram: uniqueTotals.agendaram,
      naoAgendaram: uniqueTotals.naoAgendaram,
    };
  }, [filteredRows, sellerFilter, uniqueTotals, mode, companyFilter]);

  const toggleSeller = (uid: string) => {
    setSellerFilter((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const sellerLabel =
    sellerFilter.length === 0
      ? "Todos os vendedores"
      : sellerFilter.length === 1
        ? availableSellers.find((s) => s.user_id === sellerFilter[0])?.full_name || "1 selecionado"
        : `${sellerFilter.length} selecionados`;

  const subtitle =
    mode === "vendedor"
      ? "Suas métricas de atendimento em tempo real."
      : mode === "gerente"
        ? "Suas métricas e as dos vendedores da sua empresa."
        : "Filtre por empresa e selecione vendedores específicos para detalhar as métricas.";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle>Relatório de atendimentos</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {showCompanyFilter && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Empresa</label>
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <Building2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Todas as empresas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as empresas</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showSellerFilter && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Vendedores</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-[220px] justify-between font-normal">
                      <span className="truncate">{sellerLabel}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="end">
                    <div className="p-2 border-b flex items-center justify-between">
                      <span className="text-xs font-medium">{sellerFilter.length} de {availableSellers.length}</span>
                      {sellerFilter.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSellerFilter(mode === "vendedor" ? [userId] : [])}>
                          <X className="h-3 w-3 mr-1" /> Limpar
                        </Button>
                      )}
                    </div>
                    <div className="max-h-[260px] overflow-y-auto py-1">
                      {availableSellers.map((s) => (
                        <label key={s.user_id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer text-sm">
                          <Checkbox checked={sellerFilter.includes(s.user_id)} onCheckedChange={() => toggleSeller(s.user_id)} />
                          <span className="truncate">{s.full_name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase">Período</label>
              <Select value={dateMode} onValueChange={(v) => setDateMode(v as "day" | "range")}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="range">Intervalo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateMode === "day" ? (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Data</label>
                <div className="relative">
                  <CalIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-9 w-[170px] pl-7" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase">De</label>
                  <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-[160px]" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase">Até</label>
                  <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-[160px]" />
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 mb-4">
          <SummaryStat label="Leads Adicionados" value={reportTotals.adicionados} icon={Users} tone="default" />
          <SummaryStat label="Leads Tratados" value={reportTotals.tratados} icon={Phone} tone="default" />
          <SummaryStat label="Leads Não Atenderam" value={reportTotals.naoAtenderam} icon={PhoneOff} tone="danger" />
          <SummaryStat label="Leads Atenderam" value={reportTotals.atenderam} icon={ThumbsUp} tone="success" />
          <SummaryStat label="Leads Agendaram" value={reportTotals.agendaram} icon={CalendarCheck} tone="success" />
          <SummaryStat label="Leads Não Agendaram" value={reportTotals.naoAgendaram} icon={CalendarX} tone="warning" />
          <SummaryStat label="Agendamentos CRM" value={reportTotals.agendamentos} icon={CalendarClock} tone="default" />
        </div>
        <p className="text-[11px] text-muted-foreground mb-4 -mt-1">
          Tratados = leads únicos com tentativa de contato ou tarefa manual no card (renovações e mudanças automáticas de coluna não entram).
          Agendamentos CRM = consultas registradas no sistema no período.
        </p>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : showSellerTable ? (
          filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum atendimento registrado para os filtros selecionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    {mode === "admin" && <TableHead>Empresa</TableHead>}
                    <TableHead className="text-center">Adicionados</TableHead>
                    <TableHead className="text-center">Tratados</TableHead>
                    <TableHead className="text-center text-destructive">Não atenderam</TableHead>
                    <TableHead className="text-center text-emerald-600">Atenderam</TableHead>
                    <TableHead className="text-center text-emerald-600">Agendaram</TableHead>
                    <TableHead className="text-center text-amber-600">Não agendaram</TableHead>
                    <TableHead className="text-center">Agend. CRM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={row.avatar_url ?? undefined} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(row.full_name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{row.full_name}</span>
                        </div>
                      </TableCell>
                      {mode === "admin" && <TableCell className="text-muted-foreground text-sm">{row.company_name}</TableCell>}
                      <TableCell className="text-center font-semibold">{row.adicionados}</TableCell>
                      <TableCell className="text-center font-semibold">{row.tratados}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">{row.naoAtenderam}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-500/10">{row.atenderam}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-500/10">{row.agendaram}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-500/10">{row.naoAgendaram}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{row.agendamentos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
      : tone === "danger"
        ? "text-destructive bg-destructive/10 border-destructive/30"
        : tone === "warning"
          ? "text-amber-700 bg-amber-500/10 border-amber-500/30"
          : "text-foreground bg-muted/40 border-border";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
