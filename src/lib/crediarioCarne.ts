import jsPDF from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import coraLogoUrl from "@/assets/cora-logo.jpg";

export interface CarneParcela {
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  vencimento: string;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  pix_emv: string | null;
  cora_invoice_id: string | null;
  nosso_numero?: string | null;
  numero_documento?: string | null;
}

export interface CarneEmpresa { nome: string; cnpj: string; }
export interface CarnePagador { nome: string; cpf: string; }

export interface CarneOptions {
  empresa: CarneEmpresa;
  pagador: CarnePagador;
  parcelas: CarneParcela[];
  descricao?: string;
  data_emissao?: string;
  multa_percent?: number;
  juros_mensal_percent?: number;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateBR = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
};

const maskCnpj = (s: string) => {
  const d = (s || "").replace(/\D/g, "").padStart(14, "0").slice(-14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};
const maskCpf = (s: string) => {
  const d = (s || "").replace(/\D/g, "").padStart(11, "0").slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

async function qrDataUrl(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

function barcodeDataUrl(linhaDigitavel: string): string | null {
  const digits = (linhaDigitavel || "").replace(/\D/g, "");
  if (digits.length !== 47) return null;
  const campo1 = digits.slice(0, 9);
  const campo2 = digits.slice(10, 20);
  const campo3 = digits.slice(21, 31);
  const dv = digits.slice(32, 33);
  const fatorVenc = digits.slice(33, 37);
  const valor = digits.slice(37, 47);
  const barcode44 =
    campo1.slice(0, 4) + dv + fatorVenc + valor + campo1.slice(4) + campo2 + campo3;
  if (barcode44.length !== 44) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, barcode44, {
      format: "ITF",
      displayValue: false,
      height: 100,
      width: 2,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function cell(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  opts?: { bold?: boolean; align?: "left" | "right"; valueSize?: number; labelSize?: number },
) {
  doc.setDrawColor(170);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  if (label) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts?.labelSize ?? 5.5);
    doc.setTextColor(90);
    doc.text(label, x + 2, y + 5);
  }
  if (value) {
    doc.setTextColor(0);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.valueSize ?? 7.5);
    const align = opts?.align ?? "left";
    const tx = align === "right" ? x + w - 2 : x + 2;
    doc.text(value, tx, y + h - 2.5, { align });
  }
}

function coraHeader(doc: jsPDF, x: number, y: number, logoImg: string) {
  try {
    doc.addImage(logoImg, "JPEG", x, y, 30, 9);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(232, 64, 95);
    doc.text("cora", x, y + 7);
    doc.setTextColor(0);
  }
  doc.setTextColor(120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("| 403-9 |", x + 33, y + 6.5);
  doc.setTextColor(0);
}

/* Draw a single compact boleto block at (x,y) with width w and height h (~275pt = 9.7cm) */
async function drawBoletoBlock(
  doc: jsPDF,
  opts: CarneOptions,
  p: CarneParcela,
  logoImg: string,
  x: number, y: number, w: number,
) {
  const { empresa, pagador } = opts;
  let cy = y;

  // Header row: logo + linha digitável
  coraHeader(doc, x + 2, cy + 2, logoImg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(p.linha_digitavel ?? "—", x + w - 2, cy + 8, { align: "right" });
  cy += 13;

  const rowH = 15;
  const dataDoc = fmtDateBR(opts.data_emissao ?? new Date().toISOString().slice(0, 10));

  // Row 1: Local de Pagamento | Vencimento
  cell(doc, x, cy, w * 0.78, rowH, "Local de Pagamento", "Pagável em qualquer banco até o vencimento");
  cell(doc, x + w * 0.78, cy, w * 0.22, rowH, "Vencimento", fmtDateBR(p.vencimento), { bold: true, align: "right" });
  cy += rowH;

  // Row 2: Beneficiário | CNPJ | Agência
  cell(doc, x, cy, w * 0.50, rowH, "Beneficiário", empresa.nome);
  cell(doc, x + w * 0.50, cy, w * 0.28, rowH, "CNPJ/CPF do beneficiário", maskCnpj(empresa.cnpj), { align: "right" });
  cell(doc, x + w * 0.78, cy, w * 0.22, rowH, "Agência/Código", "0001", { align: "right" });
  cy += rowH;

  // Row 3: Data doc | Nº doc | Espécie | Aceite | Data proc | Nosso número
  const c3 = [w * 0.14, w * 0.22, w * 0.10, w * 0.08, w * 0.14, w * 0.32];
  let cx = x;
  cell(doc, cx, cy, c3[0], rowH, "Data documento", dataDoc); cx += c3[0];
  cell(doc, cx, cy, c3[1], rowH, "Nº documento", `${p.numero_parcela}/${p.total_parcelas}`); cx += c3[1];
  cell(doc, cx, cy, c3[2], rowH, "Espécie", "DV"); cx += c3[2];
  cell(doc, cx, cy, c3[3], rowH, "Aceite", "N"); cx += c3[3];
  cell(doc, cx, cy, c3[4], rowH, "Data process.", dataDoc); cx += c3[4];
  cell(doc, cx, cy, c3[5], rowH, "Nosso número", p.nosso_numero ?? "—", { align: "right" });
  cy += rowH;

  // Row 4: Carteira | Espécie | Quantidade | Valor | (=) Valor do documento
  cx = x;
  cell(doc, cx, cy, c3[0], rowH, "Carteira", "01"); cx += c3[0];
  cell(doc, cx, cy, c3[1], rowH, "Espécie moeda", "R$"); cx += c3[1];
  cell(doc, cx, cy, c3[2] + c3[3], rowH, "Parcela", `${p.numero_parcela}/${p.total_parcelas}`, { align: "right" }); cx += c3[2] + c3[3];
  cell(doc, cx, cy, c3[4] + c3[5], rowH, "(=) Valor do documento", fmtBRL(Number(p.valor)), { bold: true, align: "right" });
  cy += rowH;

  // Row 5: Instruções (full)
  const descPrefix = opts.descricao ? `${opts.descricao} - ` : "";
  const multaPct = Number(opts.multa_percent ?? 0);
  const jurosPct = Number(opts.juros_mensal_percent ?? 0);
  const fmtPct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const instr = (multaPct > 0 || jurosPct > 0)
    ? `${descPrefix}Parcela ${p.numero_parcela}/${p.total_parcelas}. Após vencimento: multa ${fmtPct(multaPct)}% e juros ${fmtPct(jurosPct)}% a.m.`
    : `${descPrefix}Parcela ${p.numero_parcela}/${p.total_parcelas}.`;
  cell(doc, x, cy, w, rowH, "Instruções", instr);
  cy += rowH;

  // Row 6: Pagador
  cell(doc, x, cy, w, rowH, "Pagador", `${pagador.nome} - CPF ${maskCpf(pagador.cpf)}`);
  cy += rowH;

  // Barcode + QR area (~90pt remaining)
  const qrSize = 75;
  const bcH = 38;
  const bcW = w - qrSize - 10;
  const areaY = cy + 4;

  if (p.linha_digitavel) {
    const bcUrl = barcodeDataUrl(p.linha_digitavel);
    if (bcUrl) {
      doc.addImage(bcUrl, "PNG", x, areaY, bcW, bcH);
    }
  }
  if (p.pix_emv) {
    try {
      const qr = await qrDataUrl(p.pix_emv);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(0);
      doc.text("Pague via PIX", x + w - qrSize / 2, areaY - 1, { align: "center" });
      doc.addImage(qr, "PNG", x + w - qrSize, areaY, qrSize, qrSize);
    } catch { /* ignore */ }
  }

  doc.setFontSize(6);
  doc.setTextColor(140);
  doc.text("Autenticação mecânica - Ficha de compensação", x, areaY + Math.max(bcH, qrSize) + 6);
  doc.setTextColor(0);
}

async function loadLogoDataUrl(): Promise<string> {
  try {
    const resp = await fetch(coraLogoUrl);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return coraLogoUrl;
  }
}

export async function buildCarnePdf(opts: CarneOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const w = pageW - margin * 2;

  // 9.7cm ≈ 275pt per boleto; 3 per page = 825pt (A4 = 842pt)
  const blockH = 275;
  const gap = 4;

  const logo = await loadLogoDataUrl();

  for (let i = 0; i < opts.parcelas.length; i++) {
    const slot = i % 3;
    if (i > 0 && slot === 0) doc.addPage();
    const y = margin + slot * (blockH + gap);
    await drawBoletoBlock(doc, opts, opts.parcelas[i], logo, margin, y, w);

    // dashed cut line between blocks
    if (slot < 2 && i < opts.parcelas.length - 1) {
      doc.setLineDashPattern([3, 3], 0);
      doc.setDrawColor(140);
      doc.line(margin, y + blockH + gap / 2, margin + w, y + blockH + gap / 2);
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(0);
    }
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 8, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}

export async function downloadCarnePdf(opts: CarneOptions, filename = "carne.pdf") {
  const doc = await buildCarnePdf(opts);
  doc.save(filename);
}
