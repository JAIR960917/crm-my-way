import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CRM] Erro fatal na interface:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error.message || "Erro desconhecido";
    const isConfig = /backend ausente|runtime-config|VITE_SUPABASE/i.test(msg);

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0f172a",
          color: "#f8fafc",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", marginBottom: "12px" }}>Não foi possível abrir o CRM</h1>
        <p style={{ opacity: 0.85, marginBottom: "16px", lineHeight: 1.5 }}>
          {isConfig
            ? "A configuração do servidor não foi carregada. Peça ao administrador para rodar o deploy novamente."
            : "Ocorreu um erro ao iniciar o sistema no seu aparelho."}
        </p>
        <p style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: "20px" }}>{msg}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#dc2626",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
        <p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "20px" }}>
          iPhone: abra no Safari (não pelo WhatsApp), ou remova o app da tela inicial e acesse pelo navegador.
        </p>
      </div>
    );
  }
}
