/**
 * Gerencia os links da página pública "/links" (estilo Linktree): Instagram,
 * WhatsApp oficial, site, Campanha Copa, etc. Exibidos publicamente via a
 * edge function get-company-links (service role) — esta tabela só é lida
 * aqui pelo admin.
 */
import { useCallback, useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, ExternalLink, Heading } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LinkType = "link" | "header";

type CompanyLink = {
  id: string;
  label: string;
  url: string;
  link_type: LinkType;
  position: number;
  active: boolean;
};

export default function CompanyLinksManager() {
  const [links, setLinks] = useState<CompanyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from("company_links")
      .select("id, label, url, link_type, position, active")
      .order("position", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar links");
    } else {
      setLinks((data || []) as CompanyLink[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const patchLocal = (id: string, patch: Partial<CompanyLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const persist = async (id: string, patch: Partial<CompanyLink>) => {
    setSavingId(id);
    const { error } = await supabase.from("company_links").update(patch).eq("id", id);
    if (error) toast.error("Erro ao salvar link");
    setSavingId(null);
  };

  const handleAdd = async (type: LinkType) => {
    const nextPosition = links.length > 0 ? Math.max(...links.map((l) => l.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("company_links")
      .insert({
        label: type === "header" ? "Nova categoria" : "Novo link",
        url: "https://",
        link_type: type,
        position: nextPosition,
        active: true,
      })
      .select("id, label, url, link_type, position, active")
      .single();
    if (error || !data) {
      toast.error(type === "header" ? "Erro ao criar categoria" : "Erro ao criar link");
      return;
    }
    setLinks((prev) => [...prev, data as CompanyLink]);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("company_links").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir link");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Excluído");
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...links];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(withPositions);
    await Promise.all(
      withPositions.map((l) => supabase.from("company_links").update({ position: l.position }).eq("id", l.id)),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Links públicos (página /links)</CardTitle>
        <CardDescription>
          Gerencie os links exibidos em{" "}
          <a
            href="/links"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            /links <ExternalLink className="h-3 w-3" />
          </a>{" "}
          — Instagram, WhatsApp, site, Campanha Copa, etc. Use "Adicionar categoria" para criar
          um título de seção (ex.: "Trabalhe conosco", "Avalie nossa loja") sem link clicável,
          agrupando os links abaixo dele. Arraste para reordenar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="company-links">
              {(provided) => (
                <div className="space-y-2" ref={provided.innerRef} {...provided.droppableProps}>
                  {links.map((link, index) => (
                    <Draggable key={link.id} draggableId={link.id} index={index}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-3"
                        >
                          <div
                            {...dragProvided.dragHandleProps}
                            className="flex items-center justify-center h-9 w-9 shrink-0 cursor-grab text-muted-foreground"
                          >
                            <GripVertical className="h-4 w-4" />
                          </div>

                          <Select
                            value={link.link_type}
                            onValueChange={(v) => {
                              patchLocal(link.id, { link_type: v as LinkType });
                              void persist(link.id, { link_type: v as LinkType });
                            }}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-[130px] shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="link">Link</SelectItem>
                              <SelectItem value="header">Cabeçalho</SelectItem>
                            </SelectContent>
                          </Select>

                          <Input
                            value={link.label}
                            placeholder={link.link_type === "header" ? "Título da seção" : "Rótulo (ex.: Instagram)"}
                            className="h-9 w-full sm:w-[200px]"
                            onChange={(e) => patchLocal(link.id, { label: e.target.value })}
                            onBlur={(e) => void persist(link.id, { label: e.target.value })}
                          />

                          {link.link_type === "link" && (
                            <Input
                              value={link.url}
                              placeholder="https://..."
                              className="h-9 flex-1 min-w-0"
                              onChange={(e) => patchLocal(link.id, { url: e.target.value })}
                              onBlur={(e) => void persist(link.id, { url: e.target.value })}
                            />
                          )}

                          <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-xs text-muted-foreground">Ativo</Label>
                            <Switch
                              checked={link.active}
                              disabled={savingId === link.id}
                              onCheckedChange={(checked) => {
                                patchLocal(link.id, { active: checked });
                                void persist(link.id, { active: checked });
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive"
                              onClick={() => handleDelete(link.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handleAdd("link")}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar link
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleAdd("header")}>
            <Heading className="h-4 w-4 mr-1" /> Adicionar categoria
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
