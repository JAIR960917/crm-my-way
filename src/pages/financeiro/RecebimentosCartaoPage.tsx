import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Company { id: string; name: string; }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const pct = (v: number) => `${Number(v).toFixed(2).replace(".", ",")}%`;

function getField(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (r[k] != null && r[k] !== "") return String(r[k]);
  return "—";
}

export default function RecebimentosCartaoPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
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
        body: { tipo: "recebimentos_cartao", companyId, startDate, endDate, page: p, perPage: 100 },
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
    const operadora = String(r.operadora || r.bandeira || "").toLowerCase();
    return !search || operadora.includes(search.toLowerCase());
  });

  const totalBruto = filtered.reduce((s, r) => s + Number(r.valor_bruto ?? r.valor ?? 0), 0);
  const totalLiquido = filtered.reduce((s, r) => s + Number(r.valor_liquido ?? r.valor_liq ?? 0), 0);
  const totalTaxa = totalBruto - totalLiquido;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold">Recebimentos Cartão</h1>
            <p className="text-sm text-muted-foreground">Recebimentos via cartão de crédito/débito pelo SSótica</p>
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Valor Bruto</p><p className="text-2xl font-bold">{fmtBRL(totalBruto)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Taxas</p><p className="text-2xl font-bold text-red-700">{fmtBRL(totalTaxa)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Valor Líquido</p><p className="text-2xl font-bold text-emerald-700">{fmtBRL(totalLiquido)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Registros</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
          </div>
        )}

        {warning && <p className="text-sm text-amber-600 bg-amber-50 rounded p-3">{warning}</p>}

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Lançamentos</CardTitle>
                <Input placeholder="Buscar operadora…" className="w-60" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <CardDescription>{filtered.length} registro(s) exibidos</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Operadora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor Bruto</TableHead>
                      <TableHead>Taxa</TableHead>
                      <TableHead>Valor Líquido</TableHead>
                      <TableHead>Previsão crédito</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
                    ) : filtered.map((r, i) => {
                      const bruto = Number(r.valor_bruto ?? r.valor ?? 0);
                      const liq = Number(r.valor_liquido ?? r.valor_liq ?? 0);
                      const taxa = Number(r.taxa ?? r.percentual_taxa ?? 0);
                      return (
                        <TableRow key={i}>
                          <TableCell>{fmtDate(getField(r, "data", "data_venda", "data_lancamento"))}</TableCell>
                          <TableCell className="font-medium">{getField(r, "operadora", "bandeira", "administradora")}</TableCell>
                          <TableCell><Badge variant="outline">{getField(r, "tipo_cartao", "modalidade", "tipo")}</Badge></TableCell>
                          <TableCell>{fmtBRL(bruto)}</TableCell>
                          <TableCell className="text-red-600">{taxa > 0 ? pct(taxa) : fmtBRL(bruto - liq)}</TableCell>
                          <TableCell className="text-emerald-700 font-medium">{fmtBRL(liq)}</TableCell>
                          <TableCell>{fmtDate(getField(r, "previsao_credito", "data_credito", "data_previsao"))}</TableCell>
                        </TableRow>
                      );
                    })}
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
