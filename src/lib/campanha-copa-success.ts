export type CampanhaCopaSuccessConfig = {
  image_url: string;
  title: string;
  subtitle: string;
  instagram_url: string;
  button_label: string;
};

export const CAMPANHA_COPA_SUCCESS_SETTING_KEY = "campanha_copa_success_config";

export const DEFAULT_CAMPANHA_COPA_SUCCESS: CampanhaCopaSuccessConfig = {
  image_url: "",
  title: "Participe do canal do instagram Joonker na Copa.",
  subtitle:
    "Lá você fica por dentro de todos os nossos bolões e promoções nesse período da copa.",
  instagram_url: "https://www.instagram.com/channel/AbZblAkgWccnnG9D/",
  button_label: "Participe do canal",
};

export function parseSuccessConfig(raw: string | null | undefined): CampanhaCopaSuccessConfig {
  if (!raw?.trim()) return { ...DEFAULT_CAMPANHA_COPA_SUCCESS };
  try {
    const parsed = JSON.parse(raw) as Partial<CampanhaCopaSuccessConfig>;
    return {
      image_url: String(parsed.image_url ?? DEFAULT_CAMPANHA_COPA_SUCCESS.image_url).trim(),
      title: String(parsed.title ?? DEFAULT_CAMPANHA_COPA_SUCCESS.title).trim(),
      subtitle: String(parsed.subtitle ?? DEFAULT_CAMPANHA_COPA_SUCCESS.subtitle).trim(),
      instagram_url: String(
        parsed.instagram_url ?? DEFAULT_CAMPANHA_COPA_SUCCESS.instagram_url,
      ).trim(),
      button_label: String(
        parsed.button_label ?? DEFAULT_CAMPANHA_COPA_SUCCESS.button_label,
      ).trim(),
    };
  } catch {
    return { ...DEFAULT_CAMPANHA_COPA_SUCCESS };
  }
}

export function serializeSuccessConfig(cfg: CampanhaCopaSuccessConfig): string {
  return JSON.stringify({
    image_url: cfg.image_url.trim(),
    title: cfg.title.trim(),
    subtitle: cfg.subtitle.trim(),
    instagram_url: cfg.instagram_url.trim(),
    button_label: cfg.button_label.trim(),
  });
}
