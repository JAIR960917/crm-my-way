import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Globe, MousePointerClick, Users, Eye } from "lucide-react";

type PageView = { page: string; session_id: string | null; created_at: string };
type ButtonClick = { button_id: string | null; button_label: string | null; page: string; created_at: string };

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function subDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

export default function SiteAnalyticsPage() {
  const [rangePreset, setRangePreset] = useState("7");
  const [customStart, setCustomStart] = useState(fmt(subDays(new Date(), 7)));
  const [customEnd, setCustomEnd] = useState(fmt(new Date()));
  const [views, setViews] = useState<PageView[]>([]);
  const [clicks, setClicks] = useState<ButtonClick[]>([]);
  const [loading, setLoading] = useState(true);

  const { startISO, endISO } = useMemo(() => {
    if (rangePreset === "custom") {
      const [ys, ms, ds] = customStart.split("-").map(Number);
      const [ye, me, de] = customEnd.split("-").map(Number);
      return {
        startISO: new Date(ys, ms - 1, ds, 0, 0, 0, 0).toISOString(),
        endISO: new Date(ye, me - 1, de, 23, 59, 59, 999).toISOString(),
      };
    }
    const days = Number(rangePreset);
    const start = days === 0 ? new Date() : subDays(new Date(), days);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [rangePreset, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    const db = supabase as any;
    Promise.all([
      db
        .from("site_page_views")
        .select("page, session_id, created_at")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: true }),
      db
        .from("site_button_clicks")
        .select("button_id, button_label, page, created_at")
        .gte("created_at", startISO)
        .lte("created_at", endISO),
    ]).then(([viewsRes, clicksRes]: [any, any]) => {
      setViews((viewsRes.data || []) as PageView[]);
      setClicks((clicksRes.data || []) as ButtonClick[]);
    }).finally(() => setLoading(false));
  }, [startISO, endISO]);

  const dailyData = useMemo(() => {
    const byDay = new Map<string, number>();
    views.forEach((v) => {
      const day = v.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), visitas: count }));
  }, [views]);

  const topPages = useMemo(() => {
    const byPage = new Map<string, number>();
    views.forEach((v) => byPage.set(v.page, (byPage.get(v.page) || 0) + 1));
    return Array.from(byPage.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([page, count]) => ({ page, count }));
  }, [views]);

  const topButtons = useMemo(() => {
    const byBtn = new Map<string, number>();
    clicks.forEach((c) => {
      const key = c.button_label || c.button_id || "(sem nome)";
      byBtn.set(key, (byBtn.get(key) || 0) + 1);
    });
    return Array.from(byBtn.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [clicks]);

  const totalVisits = views.length;
  const uniqueSessions = new Set(views.map((v) => v.session_id).filter(Boolean)).size;
  const totalClicks = clicks.length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics do Site</h1>
          <p className="text-sm text-muted-foreground">
            Visitas e cliques registrados no seu site.
          </p>
        </div>

        {/* Filtro de período */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase">Período</label>
            <Select value={rangePreset} onValueChange={setRangePreset}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {rangePreset === "custom" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">De</label>
                <Input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 w-[160px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Até</label>
                <Input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 w-[160px]"
                />
              </div>
            </>
          )}
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatCard label="Total de Visitas" value={totalVisits} icon={Eye} loading={loading} description="Visualizações de página no período" />
          <StatCard label="Sessões Únicas" value={uniqueSessions} icon={Users} loading={loading} description="Visitantes únicos estimados" />
          <StatCard label="Total de Cliques" value={totalClicks} icon={MousePointerClick} loading={loading} description="Cliques em botões e links" />
        </div>

        {/* Gráfico de visitas por dia */}
        <Card>
          <CardHeader>
            <CardTitle>Visitas por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : dailyData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma visita registrada no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [v, "Visitas"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="visitas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tabelas lado a lado */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Páginas mais acessadas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" /> Páginas Mais Acessadas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6"><Skeleton className="h-40 w-full" /></div>
              ) : topPages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma visita registrada no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Página</TableHead>
                      <TableHead className="text-right w-24">Visitas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPages.map((r) => (
                      <TableRow key={r.page}>
                        <TableCell className="font-mono text-xs">{r.page || "/"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{r.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Botões mais clicados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MousePointerClick className="h-4 w-4" /> Botões Mais Clicados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6"><Skeleton className="h-40 w-full" /></div>
              ) : topButtons.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum clique registrado no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Botão / Link</TableHead>
                      <TableHead className="text-right w-24">Cliques</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topButtons.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="text-sm">{r.label}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{r.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  description,
}: {
  label: string;
  value: number;
  icon: any;
  loading: boolean;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-bold">{value.toLocaleString("pt-BR")}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
