import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";

type TrackingLink = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  count: number;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export default function CampanhaCopaTrackingLinksCard() {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const publicFormBase = `${window.location.origin}/campanha-copa`;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: linksData, error } = await supabase
      .from("campanha_copa_tracking_links")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar links de rastreamento");
      setLoading(false);
      return;
    }

    const { data: submissionsData } = await supabase
      .from("campanha_copa_submissions")
      .select("tracking_slug")
      .not("tracking_slug", "is", null);

    const countMap: Record<string, number> = {};
    (submissionsData || []).forEach((r) => {
      if (r.tracking_slug) countMap[r.tracking_slug] = (countMap[r.tracking_slug] ?? 0) + 1;
    });

    setLinks(
      (linksData || []).map((l) => ({ ...l, count: countMap[l.slug] ?? 0 })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Informe o nome do link."); return; }
    if (!slug.trim()) { toast.error("Informe o slug."); return; }
    if (!/^[a-z0-9_-]+$/.test(slug)) {
      toast.error("Slug deve conter apenas letras minúsculas, números, _ ou -.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("campanha_copa_tracking_links")
      .insert({ name: name.trim(), slug: slug.trim() });
    setSaving(false);

    if (error) {
      if (error.code === "23505") toast.error("Esse slug já existe. Escolha outro.");
      else toast.error("Erro ao criar link.");
      return;
    }

    toast.success("Link criado com sucesso!");
    setCreateOpen(false);
    setName("");
    setSlug("");
    void load();
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setDeletingId(deleteConfirmId);
    const { error } = await supabase
      .from("campanha_copa_tracking_links")
      .delete()
      .eq("id", deleteConfirmId);
    setDeletingId(null);
    setDeleteConfirmId(null);
    if (error) { toast.error("Erro ao excluir link."); return; }
    toast.success("Link excluído.");
    void load();
  };

  const copyLink = (s: string) => {
    navigator.clipboard.writeText(`${publicFormBase}?ref=${s}`).then(() => {
      toast.success("Link copiado!");
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Links de Rastreamento</CardTitle>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Novo link
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum link criado. Crie um para rastrear de qual campanha cada inscrição veio.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Inscrições</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      ?ref={link.slug}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{link.count}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Copiar link"
                          onClick={() => copyLink(link.slug)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Abrir formulário com este link"
                          asChild
                        >
                          <a
                            href={`${publicFormBase}?ref=${link.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Excluir link"
                          onClick={() => setDeleteConfirmId(link.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setName(""); setSlug(""); } else setCreateOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Link de Rastreamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Ex.: Instagram Jun/25"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Slug (parte do link) <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="ex.: instagram_jun25"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, "")
                      .slice(0, 40),
                  )
                }
              />
              {slug && (
                <p className="text-xs text-muted-foreground break-all">
                  Link gerado:{" "}
                  <span className="font-mono">
                    {publicFormBase}?ref={slug}
                  </span>
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => { setCreateOpen(false); setName(""); setSlug(""); }}
              >
                Cancelar
              </Button>
              <Button onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "Salvando..." : "Criar link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir link de rastreamento?</AlertDialogTitle>
            <AlertDialogDescription>
              As inscrições que vieram por este link continuarão registradas, mas o slug será liberado
              e o link deixará de ser rastreado se for reutilizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={!!deletingId}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
