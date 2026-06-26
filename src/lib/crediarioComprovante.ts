import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "comprovantes-assinatura";
const MAX_IMAGE_DIM = 1280;
const JPEG_QUALITY = 0.8;
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

function isImageFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a imagem. Tente JPG ou PNG."));
    };
    img.src = url;
  });
}

async function compressImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  let { width, height } = img;
  const maxSide = Math.max(width, height);
  if (maxSide > MAX_IMAGE_DIM) {
    const scale = MAX_IMAGE_DIM / maxSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste dispositivo");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Falha ao comprimir a foto");
  return blob;
}

async function prepareBlob(file: File): Promise<{ blob: Blob; filename: string; mime: string }> {
  if (isImageFile(file)) {
    try {
      const blob = await compressImage(file);
      return {
        blob,
        filename: (file.name.replace(/\.[^.]+$/, "") || "comprovante") + ".jpg",
        mime: "image/jpeg",
      };
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? e.message
          : "Foto não suportada. Use JPG/PNG ou tire outra foto.",
      );
    }
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 4 MB.`,
    );
  }
  return { blob: file, filename: file.name || "comprovante.pdf", mime };
}

/** Envia comprovante ao Storage (payload leve na edge function — funciona no celular). */
export async function uploadComprovanteForSigning(
  supabase: SupabaseClient,
  userId: string,
  contratoId: string,
  file: File,
): Promise<string> {
  const { blob, filename, mime } = await prepareBlob(file);
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `Arquivo ainda grande após compressão (${(blob.size / 1024 / 1024).toFixed(1)} MB). Tente outra foto.`,
    );
  }

  const ext = filename.includes(".") ? filename.split(".").pop() : "jpg";
  const path = `${userId}/${contratoId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: mime,
  });

  if (error) {
    throw new Error(error.message || "Falha ao enviar comprovante");
  }

  return path;
}
