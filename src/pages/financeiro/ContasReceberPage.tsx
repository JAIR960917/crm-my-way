import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Company { id: string; name: string; }

interface Parcela {
  titulo_id?: number;
  parcela_id?: number;
  numero_parcela?: number;
  cliente_id?: number;
  cliente_nome?: string;
  nome_cliente?: string;
  vencimento?: string;
  valor?: number;
  situacao?: string;
  dias_atraso?: number;
  [key: string]: unknown;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function situacaoBadge(s?: string) {
  if (!s) return <Badge variant="outline">—</Badge>;
  const sl = s.toLowerCase();
  if (sl.includes("pago") || sl.includes("recebido")) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{s}</Badge>;
  if (sl.includes("vencid") || sl.includes("atraso")) return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export default function ContasReceberPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Parcela[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [warning, setWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: integs } = await supabase.from("ssotica_integrations").select("company_id").eq("is_active", true);
      const ids = new Set((integs || []).map((i: any) => i.company_id));
      const { data } = await supabase.from("companies").select("id, name").order("name");
      const filtered = ((data as Company[]) || []).filter(c => ids.has(c.id));
      setCompanies(filtered);
      if (filtered.length > 0) setCompanyId(filtered[0].id);
    })();
  }, []);

  async function load(p = 1) {
    if (!companyId) return;
    setLoading(true); setWarning(null);
    try {
      const { data, error } = await supabase.functions.invoke("ssotica-financeiro", {
        body: { tipo: "contas_receber", companyId, startDate, endDate, page: p, perPage: 100 },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data.warning) setWarning(data.warning);
      setRows(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar dados");
    } finally { setLoading(false); }
  }

  const filtered = rows.filter(r => {
    const nome = String(r.cliente_nome || r.nome_cliente || "").toLowerCase();
    return !search || nome.includes(search.toLowerCase());
  });

  const totalValor = filtered.reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const vencidos = filtered.filter(r => Number(r.dias_atraso ?? 0) > 0).length;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold">Contas a Receber</h1>
            <p className="text-sm text-muted-foreground">Parcelas em aberto via SSótica</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Empresa" /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" className="w-40" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input type="date" className="w-40" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <Button onClick={() => void load(1)} disabled={loading || !companyId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total em aberto</p><p className="text-2xl font-bold text-emerald-700">{fmtBRL(totalValor)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Registros</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Vencidos</p><p className="text-2xl font-bold text-red-600">{vencidos}</p></CardContent></Card>
          </div>
        )}

        {warning && <p className="text-sm text-amber-600 bg-amber-50 rounded p-3">{warning}</p>}

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Parcelas</CardTitle>
                <Input placeholder="Buscar cliente…" className="w-60" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <CardDescription>{filtered.length} registro(s) exibidos</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Dias atraso</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
                    ) : filtered.map((r, i) => (
                      <TableRow key={r.parcela_id ?? i}>
                        <TableCell className="font-medium">{String(r.cliente_nome || r.nome_cliente || "—")}</TableCell>
                        <TableCell>{fmtDate(r.vencimento as string)}</TableCell>
                        <TableCell>{r.numero_parcela ?? "—"}</TableCell>
                        <TableCell>{fmtBRL(Number(r.valor ?? 0))}</TableCell>
                        <TableCell>{r.dias_atraso != null ? <span className={Number(r.dias_atraso) > 0 ? "text-red-600 font-medium" : ""}>{r.dias_atraso} dias</span> : "—"}</TableCell>
                        <TableCell>{situacaoBadge(r.situacao as string)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
