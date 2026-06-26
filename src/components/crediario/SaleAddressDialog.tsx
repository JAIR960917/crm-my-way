import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskPhone } from "@/lib/crediarioContract";

export interface EmpresaOption {
  id: string;
  nome: string;
  cidade: string;
}

export interface AddressData {
  endereco: string;
  telefone: string;
  primeiroVencimento: string; // ISO yyyy-mm-dd
  cidade: string;
  empresaId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado quando o vendedor confirma os dados (após dialog de confirmação). */
  onConfirm: (data: AddressData) => void;
  clienteNome?: string;
  /** Cidade padrão (do usuário logado) — usada quando nenhuma seleção é exigida. */
  cidadePadrao?: string;
  /** ID da empresa do gerente (preenchido automaticamente quando não há seletor). */
  empresaPadraoId?: string | null;
  /** Quando preenchido, exibe seletor de empresa (admin). */
  empresasDisponiveis?: EmpresaOption[];
}

export function SaleAddressDialog({
  open, onOpenChange, onConfirm, clienteNome, empresaPadraoId, empresasDisponiveis,
}: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidadeInput, setCidadeInput] = useState("");
  const [estado, setEstado] = useState("");
  const [pontoReferencia, setPontoReferencia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [empresaId, setEmpresaId] = useState<string>("");
  const defaultVenc = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const [primeiroVencimento, setPrimeiroVencimento] = useState<string>(defaultVenc);

  const mostrarSeletorEmpresa = !!empresasDisponiveis && empresasDisponiveis.length > 0;

  // Auto-seleciona quando há apenas uma empresa
  useEffect(() => {
    if (mostrarSeletorEmpresa && !empresaId && empresasDisponiveis!.length === 1) {
      setEmpresaId(empresasDisponiveis![0].id);
    }
  }, [mostrarSeletorEmpresa, empresaId, empresasDisponiveis]);

  const empresaSelecionada = empresasDisponiveis?.find((e) => e.id === empresaId) ?? null;

  const reset = () => {
    setStep("form");
    setRua("");
    setNumero("");
    setBairro("");
    setCidadeInput("");
    setEstado("");
    setPontoReferencia("");
    setTelefone("");
    setEmpresaId("");
    setPrimeiroVencimento(defaultVenc);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const cidadeFinal = cidadeInput.trim();
  const empresaFinalId = mostrarSeletorEmpresa ? (empresaId || null) : (empresaPadraoId ?? null);

  const enderecoCompleto = [
    [rua.trim(), numero.trim()].filter(Boolean).join(", "),
    pontoReferencia.trim(),
    bairro.trim() ? `Bairro ${bairro.trim()}` : "",
    [cidadeFinal, estado.trim().toUpperCase()].filter(Boolean).join("-"),
  ].filter(Boolean).join(", ");

  const podeAvancar =
    rua.trim().length >= 2 &&
    numero.trim().length >= 1 &&
    bairro.trim().length >= 2 &&
    cidadeFinal.trim().length >= 2 &&
    estado.trim().length >= 2 &&
    telefone.replace(/\D/g, "").length >= 10 &&
    !!primeiroVencimento &&
    (!mostrarSeletorEmpresa || !!empresaId);

  const vencFmt = primeiroVencimento
    ? new Date(primeiroVencimento + "T00:00:00").toLocaleDateString("pt-BR")
    : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex w-[calc(100%-1.5rem)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg top-[5%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
        {step === "form" ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4">
              <DialogTitle>Dados para o contrato</DialogTitle>
              <DialogDescription>
                {clienteNome ? `Informe o endereço e telefone de ${clienteNome}.` : "Informe o endereço e o telefone do cliente."}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              {mostrarSeletorEmpresa && (
                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa da venda</Label>
                  <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger id="empresa">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {empresasDisponiveis!.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}{e.cidade ? ` · ${e.cidade}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Como administrador, escolha a empresa onde a venda está sendo realizada.
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div className="space-y-2">
                  <Label htmlFor="rua">Rua/Av.</Label>
                  <Input id="rua" placeholder="Rua/AV" value={rua} onChange={(e) => setRua(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" placeholder="123" value={numero} onChange={(e) => setNumero(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input id="cidade" placeholder="Cidade" value={cidadeInput} onChange={(e) => setCidadeInput(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado (UF)</Label>
                  <Input id="estado" placeholder="RN" maxLength={2} value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ponto-ref">Ponto de Referência</Label>
                <Input id="ponto-ref" placeholder="Ponto de Referência" value={pontoReferencia} onChange={(e) => setPontoReferencia(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  placeholder="(11) 91234-5678"
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primeiro-venc">Vencimento da 1ª parcela</Label>
                <Input
                  id="primeiro-venc"
                  type="date"
                  value={primeiroVencimento}
                  onChange={(e) => setPrimeiroVencimento(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={!podeAvancar} onClick={() => setStep("confirm")}>
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4">
              <DialogTitle>Confirmar dados</DialogTitle>
              <DialogDescription>
                Confira os dados antes de gerar o contrato. Eles serão preenchidos automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
              {empresaSelecionada && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Empresa da venda</p>
                  <p className="font-medium">
                    {empresaSelecionada.nome}{empresaSelecionada.cidade ? ` · ${empresaSelecionada.cidade}` : ""}
                  </p>
                </div>
              )}
              {!empresaSelecionada && cidadeFinal && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Cidade da venda</p>
                  <p className="font-medium">{cidadeFinal}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Endereço</p>
                <p className="font-medium whitespace-pre-wrap">{enderecoCompleto}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</p>
                <p className="font-medium">{telefone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Vencimento da 1ª parcela</p>
                <p className="font-medium">{vencFmt}</p>
              </div>
            </div>
            </div>

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setStep("form")}>Voltar e editar</Button>
              <Button
                className="bg-success hover:bg-success/90 text-success-foreground"
                onClick={() => {
                  onConfirm({
                    endereco: enderecoCompleto,
                    telefone,
                    primeiroVencimento,
                    cidade: cidadeFinal,
                    empresaId: empresaFinalId,
                  });
                  reset();
                }}
              >
                Confirmar e gerar contrato
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
