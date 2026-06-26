import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_SIZES = new Set(["192", "512"]);

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = (roleRows || []).some((r) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem alterar o ícone do PWA" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const contentType = typeof body?.contentType === "string" ? body.contentType : "image/png";
    const dataB64 = typeof body?.data === "string" ? body.data : "";
    const size = typeof body?.size === "string" ? body.size : "";

    if (!ALLOWED_SIZES.has(size)) {
      return new Response(JSON.stringify({ error: "Tamanho inválido (use 192 ou 512)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dataB64) {
      return new Response(JSON.stringify({ error: "Arquivo inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_TYPES.has(contentType)) {
      return new Response(JSON.stringify({ error: "Formato não suportado. Use PNG, JPG ou WEBP." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = decodeBase64(dataB64);
    if (bytes.length > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "Arquivo muito grande (máx. 5 MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nome determinístico (não usa timestamp) — upsert sobrescreve a versão
    // anterior, então o link salvo em system_settings nunca fica quebrado.
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const fileName = `pwa-icon-${size}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("logos")
      .upload(fileName, bytes, {
        contentType,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[upload-pwa-icon] upload:", uploadError);
      return new Response(JSON.stringify({ error: "Erro ao fazer upload da imagem." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabaseAdmin.storage.from("logos").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;
    const settingKey = `pwa_icon_${size}_url`;

    const { error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .upsert({ setting_key: settingKey, setting_value: publicUrl, updated_at: new Date().toISOString() }, { onConflict: "setting_key" });

    if (settingsError) {
      console.error("[upload-pwa-icon] settings update:", settingsError);
      return new Response(JSON.stringify({ error: "Erro ao salvar configuração do ícone." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ publicUrl, settingKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[upload-pwa-icon]", e);
    return new Response(JSON.stringify({ error: "Erro interno ao processar upload." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
