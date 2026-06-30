import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveStoragePublicUrl } from "@/lib/storage-url";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Trash2, ExternalLink } from "lucide-react";
import CompanyLinksManager from "@/components/settings/CompanyLinksManager";

export default function LinksAdminPage() {
  const { isAdmin } = useAuth();
  const [linksLogoUrl, setLinksLogoUrl] = useState("");
  const [linksLogoUploading, setLinksLogoUploading] = useState(false);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "links_logo_url")
      .maybeSingle()
      .then(({ data }) => {
        setLinksLogoUrl(data?.setting_value || "");
      });
  }, []);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(file);
    });

  const handleLinksLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5 MB)");
      e.target.value = "";
      return;
    }

    setLinksLogoUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `links_logo_${Date.now()}.${ext}`;
      const data = await fileToBase64(file);
      const contentType = file.type || "image/png";

      const { data: result, error } = await supabase.functions.invoke("upload-system-logo", {
        body: { fileName, contentType, data, settingKey: "links_logo_url" },
      });

      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);

      const publicUrl = resolveStoragePublicUrl(result.publicUrl as string);
      setLinksLogoUrl(publicUrl);
      toast.success("Logo da página /links atualizada!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar logo";
      toast.error(msg);
    } finally {
      setLinksLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveLinksLogo = async () => {
    setLinksLogoUrl("");
    await supabase
      .from("system_settings")
      .update({ setting_value: "", updated_at: new Date().toISOString() })
      .eq("setting_key", "links_logo_url");
    toast.success("Logo removida");
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">
          Acesso restrito a administradores.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">Links Públicos</h1>
          <a
            href="/links"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver página /links
          </a>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Gerencie os links exibidos em{" "}
          <a href="/links" target="_blank" rel="noopener noreferrer" className="text-primary underline">/links</a>
          {" "}— Instagram, WhatsApp, site, Campanha Copa, etc. Use "Adicionar categoria" para criar um título de seção
          sem link clicável, agrupando os links abaixo dele. Arraste para reordenar.
        </p>
      </div>

      {/* Logo da página /links */}
      <div className="max-w-lg space-y-2 mb-8">
        <Label>Logo da página /links</Label>
        <p className="text-[11px] text-muted-foreground">
          Exibida no topo de{" "}
          <a href="/links" target="_blank" rel="noopener noreferrer" className="text-primary underline">/links</a>.
          Se não enviar uma, usa a Logo do Sistema das Configurações. Prefira uma imagem quadrada/redonda.
        </p>
        <div className="flex items-center gap-4">
          {linksLogoUrl ? (
            <div className="relative">
              <img
                src={resolveStoragePublicUrl(linksLogoUrl)}
                alt="Logo da página /links"
                className="h-16 w-16 rounded-full object-contain border bg-card"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6"
                onClick={handleRemoveLinksLogo}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
              <Upload className="h-5 w-5 text-muted-foreground/50" />
            </div>
          )}
          <div>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={linksLogoUploading}>
                <span>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {linksLogoUploading ? "Enviando..." : "Enviar Logo"}
                </span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLinksLogoUpload}
              />
            </label>
            <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG ou SVG</p>
          </div>
        </div>
      </div>

      <CompanyLinksManager />
    </AppLayout>
  );
}
