export type CampanhaCopaSuccessConfig = {
  image_url: string;
  title: string;
  subtitle: string;
  instagram_url: string;
  button_label: string;
};

export const CAMPANHA_COPA_SUCCESS_SETTING_KEY = "campanha_copa_success_config";

const DEFAULT: CampanhaCopaSuccessConfig = {
  image_url: "",
  title: "Participe do canal do instagram Joonker na Copa.",
  subtitle:
    "Lá você fica por dentro de todos os nossos bolões e promoções nesse período da copa.",
  instagram_url: "https://www.instagram.com/channel/AbZblAkgWccnnG9D/",
  button_label: "Participe do canal",
};

export function parseSuccessConfig(raw: string | null | undefined): CampanhaCopaSuccessConfig {
  if (!raw?.trim()) return { ...DEFAULT };
  try {
    const parsed = JSON.parse(raw) as Partial<CampanhaCopaSuccessConfig>;
    return {
      image_url: String(parsed.image_url ?? DEFAULT.image_url).trim(),
      title: String(parsed.title ?? DEFAULT.title).trim(),
      subtitle: String(parsed.subtitle ?? DEFAULT.subtitle).trim(),
      instagram_url: String(parsed.instagram_url ?? DEFAULT.instagram_url).trim(),
      button_label: String(parsed.button_label ?? DEFAULT.button_label).trim(),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function loadCampanhaCopaSuccessConfig(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
): Promise<CampanhaCopaSuccessConfig> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", CAMPANHA_COPA_SUCCESS_SETTING_KEY)
    .maybeSingle();

  return parseSuccessConfig(data?.setting_value);
}
