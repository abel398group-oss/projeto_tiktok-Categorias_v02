import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clearRecentWorkspace, getRecentWorkspace } from "./recentWorkspace.js";

/**
 * **Produtos em análise** (`/a-mao`): histórico local de produtos visitados — **sem** carregar relatórios da API.
 */
export default function HandsOnPage() {
  const [recentPages, setRecentPages] = useState(() => getRecentWorkspace());

  useEffect(() => {
    setRecentPages(getRecentWorkspace());
  }, []);

  const refreshRecent = () => setRecentPages(getRecentWorkspace());

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.25rem" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Produtos em análise</h1>
      <p style={{ fontSize: "0.82rem", opacity: 0.82, margin: "0 0 1rem", maxWidth: "42rem", lineHeight: 1.5 }}>
        Lista dos produtos que abriu para análise. Use para continuar a avaliar ou comparar e para reabrir o workspace; o envio ao <strong>DigitalOcean Spaces</strong> faz-se em <strong>Analytics</strong> › <strong>Product Score</strong> com o botão <strong>Exportar</strong> na coluna <strong>Ações</strong>. Histórico apenas neste browser — não é necessário carregar relatórios aqui.
      </p>

      <section
        style={{
          marginBottom: "1rem",
          padding: "0.65rem 0.75rem",
          borderRadius: 8,
          border: "1px solid #2a3844",
          background: "#151e27"
        }}
      >
        <div style={{ fontSize: "0.74rem", opacity: 0.88, marginBottom: "0.45rem" }}>
          <strong>Produtos abertos</strong> — ordenados do mais recente para o mais antigo.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <button
            type="button"
            onClick={refreshRecent}
            style={{
              padding: "0.18rem 0.45rem",
              fontSize: "0.65rem",
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid #45515c",
              background: "#22303c",
              color: "#e7e9ea"
            }}
          >
            Actualizar lista
          </button>
          {recentPages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearRecentWorkspace();
                setRecentPages([]);
              }}
              style={{
                padding: "0.18rem 0.45rem",
                fontSize: "0.65rem",
                cursor: "pointer",
                borderRadius: 6,
                border: "1px solid #524a40",
                background: "#252018",
                color: "#dfc8a8"
              }}
            >
              Limpar histórico
            </button>
          ) : null}
        </div>
        {recentPages.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem", alignItems: "center" }}>
            {recentPages.map((r) => (
              <Link
                key={r.productId}
                to={`/produto/${encodeURIComponent(r.productId)}`}
                title={`${r.nome} · ${r.productId}`}
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  padding: "0.26rem 0.55rem",
                  fontSize: "0.72rem",
                  borderRadius: 6,
                  border: "1px solid #394e63",
                  background: "#1a2834",
                  color: "#dce9f8",
                  textDecoration: "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  verticalAlign: "middle"
                }}
              >
                {(r.nome || "—").length > 42 ? `${(r.nome || "—").slice(0, 39)}…` : r.nome || "—"}
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.76rem", opacity: 0.72, lineHeight: 1.45 }}>
            Ainda não há produtos aqui. Em <strong>Analytics</strong> › <strong>Product Score</strong>, carregue os dados se precisar e clique no <strong>nome</strong> do produto para abrir o workspace; ao voltar a{" "}
            <strong>Produtos em análise</strong>, o item aparece nesta lista (ou use «Actualizar lista»).
          </p>
        )}
      </section>
    </div>
  );
}
