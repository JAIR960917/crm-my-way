import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Boxes, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

interface Company {
  id: string;
  name: string;
}

interface Produto {
  id: number;
  referencia: string;
  descricao: string;
  unidade: string | null;
  grife: string | null;
  grupo: string | null;
  subgrupo: string | null;
  cor: string | null;
  tamanho: string | null;
  estoque_atual: number;
  reservado_os: number;
  disponivel: number;
  preco_venda: number;
  preco_custo: number;
  ativo: boolean;
  codigo_ean: string | null;
}

const PER_PAGE = 100;

const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EstoquePage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [referenciaInput, setReferenciaInput] = useState("");
  const [referencia, setReferencia] = useState("");

  useEffect(() => {
    (async () => {
      const { data: integs } = await supabase
        .from("ssotica_integrations")
        .select("company_id, is_active")
        .eq("is_active", true);
      const ids = new Set<string>((integs || []).map((i: any) => i.company_id));
      const { data } = await supabase.from("companies").select("id, name").order("name");
      const filtered = ((data as Company[]) || []).filter((c) => ids.has(c.id));
      setCompanies(filtered);
      if (filtered.length > 0) setCompanyId(filtered[0].id);
    })();
  }, []);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setWarning(null);
    const { data, error } = await invokeEdgeFunction<{
      companyName: string;
      currentPage: number;
      totalPages: number;
      totalItems: number;
      perPage: number;
      data: Produto[];
      warning?: string;
    }>("ssotica-estoque-busca", {
      body: {
        companyId,
        page,
        perPage: PER_PAGE,
        referencia: referencia || undefined,
      },
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Erro ao buscar estoque",
        description: error.message,
        variant: "destructive",
      });
      setProdutos([]);
      setTotalPages(0);
      setTotalItems(0);
      return;
    }
    setProdutos(data?.data || []);
    setTotalPages(data?.totalPages || 0);
    setTotalItems(data?.totalItems || 0);
    if (data?.warning) setWarning(data.warning);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, page, referencia]);

  function handleSearch() {
    setPage(1);
    setReferencia(referenciaInput.trim());
  }

  function clearSearch() {
    setReferenciaInput("");
    setReferencia("");
    setPage(1);
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="h-6 w-6" />
            Estoque
          </h1>
          <p className="text-muted-foreground text-sm">
            Estoque atual dos produtos sincronizado direto da SSótica.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Selecione a loja e, se quiser, busque por uma referência específica.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-64">
              <Select
                value={companyId}
                onValueChange={(v) => {
                  setPage(1);
                  setCompanyId(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar loja..." />
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
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="Buscar por referência exata..."
                value={referenciaInput}
                onChange={(e) => setReferenciaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button variant="outline" onClick={handleSearch} disabled={loading}>
                <Search className="h-4 w-4" />
              </Button>
              {referencia && (
                <Button variant="ghost" onClick={clearSearch} disabled={loading}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle>Produtos {totalItems > 0 && `(${totalItems})`}</CardTitle>
              {warning && <CardDescription className="text-amber-600">{warning}</CardDescription>}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                Página {page} de {totalPages}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Grife</TableHead>
                  <TableHead>Cor/Tam.</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead className="text-right">Preço Venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                ) : produtos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  produtos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.referencia}</TableCell>
                      <TableCell className="max-w-[280px] truncate" title={p.descricao}>
                        {p.descricao}
                        {!p.ativo && (
                          <Badge variant="secondary" className="ml-2">
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.grupo || "—"}</TableCell>
                      <TableCell>{p.grife || "—"}</TableCell>
                      <TableCell>
                        {[p.cor, p.tamanho].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">{p.estoque_atual}</TableCell>
                      <TableCell className="text-right">{p.reservado_os}</TableCell>
                      <TableCell className="text-right font-semibold">{p.disponivel}</TableCell>
                      <TableCell className="text-right">{formatBRL(p.preco_venda)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
