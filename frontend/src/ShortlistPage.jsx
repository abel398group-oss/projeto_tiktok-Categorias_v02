import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { badgeTextForProductStatus, getProductStatusForProduct } from "./productStatusStorage.js";
import {
  CREATOR_SHORTLIST_STORAGE_KEY,
  getCreatorShortlist,
  removeFromCreatorShortlist
} from "./productShortlistStorage.js";

const NOTES_LS_PREFIX = "tiktok-analytics-product-notes:";

/** @param {string} productId */
function notePreview(productId) {
  try {
    const raw = localStorage.getItem(`${NOTES_LS_PREFIX}${productId}`);
    if (!raw || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  } catch {
    return null;
  }
}

/** @param {string} iso */
function fmtAddedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(d);
}

export default function ShortlistPage() {
  const [entries, setEntries] = useState(() => getCreatorShortlist());

  const refresh = useCallback(() => {
    setEntries(getCreatorShortlist());
  }, []);

  useEffect(() => {
    refresh();
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
      if (e.key === CREATOR_SHORTLIST_STORAGE_KEY || e.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const onRemove = useCallback(
    (productId) => {
      removeFromCreatorShortlist(productId);
      refresh();
    },
    [refresh]
  );

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <p style={{ marginBottom: "0.65rem", fontSize: "0.8rem" }}>
          <Link to="/" style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}>
            ← Voltar ao painel
          </Link>
        </p>

        <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Minha shortlist</h1>
        <p style={{ fontSize: "0.82rem", opacity: 0.85, margin: "0 0 1rem", maxWidth: "40rem", lineHeight: 1.55 }}>
          Produtos que marcou com <strong>Favoritar</strong> no workspace. Dados só neste browser (não sincronizam com o servidor).
        </p>

        {entries.length === 0 ? (
          <p style={{ fontSize: "0.85rem", opacity: 0.82, lineHeight: 1.6, maxWidth: "32rem" }}>
            Nenhum produto na shortlist ainda. Abra um produto e clique em <strong>Favoritar</strong>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {entries.map((e) => {
              const statusKey = getProductStatusForProduct(e.productId);
              const note = notePreview(e.productId);
              return (
                <li
                  key={e.productId}
                  style={{
                    border: "1px solid #2f3f4d",
                    borderRadius: 8,
                    padding: "0.65rem 0.75rem",
                    background: "#151e27"
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
                      <Link
                        to={`/produto/${encodeURIComponent(e.productId)}`}
                        style={{
                          fontWeight: 600,
                          fontSize: "0.88rem",
                          color: "#8ecdfa",
                          textDecoration: "none",
                          lineHeight: 1.35,
                          wordBreak: "break-word"
                        }}
                      >
                        {e.nome}
                      </Link>
                      <p style={{ margin: "0.28rem 0 0", fontSize: "0.68rem", fontFamily: "ui-monospace, monospace", opacity: 0.75, wordBreak: "break-all" }}>
                        {e.productId}
                      </p>
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", opacity: 0.78 }}>
                        Adicionado: <strong>{fmtAddedAt(e.addedAt)}</strong>
                      </p>
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", opacity: 0.85 }}>
                        Pipeline: <strong>{badgeTextForProductStatus(statusKey)}</strong>
                      </p>
                      {note ? (
                        <p style={{ margin: "0.4rem 0 0", fontSize: "0.7rem", opacity: 0.72, lineHeight: 1.45, fontStyle: "italic", color: "#9db4c8" }}>
                          Nota: {note}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <Link
                        to={`/produto/${encodeURIComponent(e.productId)}`}
                        style={{
                          padding: "0.28rem 0.55rem",
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          borderRadius: 6,
                          border: "1px solid #3978a8",
                          background: "#1e4a63",
                          color: "#eaf6ff",
                          textAlign: "center",
                          textDecoration: "none"
                        }}
                      >
                        Abrir workspace
                      </Link>
                      <button
                        type="button"
                        onClick={() => onRemove(e.productId)}
                        style={{
                          padding: "0.28rem 0.55rem",
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          borderRadius: 6,
                          border: "1px solid #6b3030",
                          background: "#2a1515",
                          color: "#fca5a5"
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
