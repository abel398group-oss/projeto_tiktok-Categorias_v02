import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";
import {
  getProductStatuses,
  labelForProductStatus,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_DEFAULT,
  normalizeProductStatusKey,
  setProductStatus
} from "./productStatusStorage.js";
import { clearRecentWorkspace, getRecentWorkspace } from "./recentWorkspace.js";

/**
 * Mais recentes primeiro (campo opcional `at` no histórico local).
 * @param {{ productId: string, nome?: string, at?: string }[]} list
 */
function sortRecentNewestFirst(list) {
  return [...list].sort((a, b) => {
    const ta = a.at ? Date.parse(a.at) : NaN;
    const tb = b.at ? Date.parse(b.at) : NaN;
    const va = Number.isFinite(ta) ? ta : 0;
    const vb = Number.isFinite(tb) ? tb : 0;
    return vb - va;
  });
}

/** @typedef {{ loading?: boolean, preco?: unknown, vendas?: unknown, rating?: unknown, nome?: string, error?: string | null }} RowDetail */

const btnBase = {
  padding: "0.28rem 0.55rem",
  fontSize: "0.68rem",
  cursor: "pointer",
  borderRadius: 6,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
  textAlign: "center",
  whiteSpace: "nowrap"
};

const btnOpen = {
  ...btnBase,
  border: "1px solid #3978a8",
  background: "#1e4a63",
  color: "#eaf6ff"
};

const btnExport = {
  ...btnBase,
  border: "1px solid #4a7a9e",
  background: "#1a3a52",
  color: "#e8f4ff"
};

/** @param {import("./productStatusStorage.js").ProductStatusKey} key */
function badgeStyleForStatus(key) {
  const k = normalizeProductStatusKey(key);
  switch (k) {
    case "exportado":
      return {
        background: "#1e3a5f",
        color: "#93c5fd",
        border: "1px solid #2563eb"
      };
    case "testar":
      return {
        background: "#422006",
        color: "#fcd34d",
        border: "1px solid #d97706"
      };
    case "descartado":
      return {
        background: "#450a0a",
        color: "#fca5a5",
        border: "1px solid #dc2626"
      };
    case "em_analise":
    default:
      return {
        background: "#2a3038",
        color: "#9ca3af",
        border: "1px solid #4b5563"
      };
  }
}

/**
 * **Produtos em análise** (`/a-mao`): histórico local + detalhes via API já existente.
 */
export default function HandsOnPage() {
  /** @type {[{ productId: string, nome?: string, at?: string }, ...]} */
  const [recentPages, setRecentPages] = useState(() => sortRecentNewestFirst(getRecentWorkspace()));
  /** @type {Record<string, import("./productStatusStorage.js").ProductStatusKey>} */
  const [statusMap, setStatusMap] = useState(() => getProductStatuses());
  /** @type {Record<string, RowDetail>} */
  const [details, setDetails] = useState({});
  const [exportingId, setExportingId] = useState(/** @type {string | null} */ (null));
  /** @type {{ kind: "ok" | "err", text: string, productId: string } | null} */
  const [exportFlash, setExportFlash] = useState(null);

  const refreshRecent = useCallback(() => {
    setRecentPages(sortRecentNewestFirst(getRecentWorkspace()));
    setStatusMap(getProductStatuses());
    setExportFlash(null);
  }, []);

  useEffect(() => {
    let cancel = false;
    const ids = recentPages.map((r) => r.productId).filter(Boolean);
    if (ids.length === 0) {
      setDetails({});
      return undefined;
    }

    setDetails((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { ...next[id], loading: true, error: next[id]?.error ?? null };
      }
      return next;
    });

    (async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const j = await apiFetch(`/analytics/product-workspace/${encodeURIComponent(id)}`);
            return {
              id,
              ok: true,
              payload: /** @type {Record<string, unknown>} */ (j)
            };
          } catch (e) {
            return {
              id,
              ok: false,
              err: e instanceof Error ? e.message : String(e)
            };
          }
        })
      );

      if (cancel) return;

      setDetails((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.ok && r.payload) {
            next[r.id] = {
              loading: false,
              preco: r.payload.preco ?? "—",
              vendas: r.payload.vendas ?? "—",
              rating: r.payload.rating ?? "—",
              nome: typeof r.payload.nome === "string" ? r.payload.nome : undefined,
              error: null
            };
          } else if (!r.ok) {
            next[r.id] = {
              loading: false,
              preco: "—",
              vendas: "—",
              rating: "—",
              error: typeof r.err === "string" ? r.err : "—"
            };
          }
        }
        return next;
      });
    })();

    return () => {
      cancel = true;
    };
  }, [recentPages]);

  const onExport = useCallback(async (productId) => {
    setExportingId(productId);
    setExportFlash(null);
    try {
      const res = await apiPost("/analytics/export-product-to-spaces", { productId });
      const prefix = typeof res?.prefix === "string" ? res.prefix : "";
      const up = typeof res?.imagesUploaded === "number" ? res.imagesUploaded : 0;
      const disc = typeof res?.imagesDiscovered === "number" ? res.imagesDiscovered : 0;
      const fail = typeof res?.imagesFailed === "number" ? res.imagesFailed : 0;
      setProductStatus(productId, "exportado");
      setStatusMap(getProductStatuses());
      setExportFlash({
        kind: "ok",
        productId,
        text: `Enviado: ${prefix || "ok"} · imagens ${up}/${disc}${fail ? ` (${fail} falhas)` : ""}.`
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setExportFlash({ kind: "err", productId, text });
    } finally {
      setExportingId(null);
    }
  }, []);

  /** @param {string} pid @param {import("./productStatusStorage.js").ProductStatusKey} statusKey */
  const onPickStatus = useCallback((pid, statusKey) => {
    setProductStatus(pid, statusKey);
    setStatusMap(getProductStatuses());
  }, []);

  const rowsSorted = useMemo(() => recentPages, [recentPages]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.25rem" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Produtos em análise</h1>
      <p style={{ fontSize: "0.82rem", opacity: 0.82, margin: "0 0 1rem", maxWidth: "42rem", lineHeight: 1.5 }}>
        Lista dos produtos que abriu para análise (ordenados do mais recente). Os valores de preço, vendas e rating vêm da API ao abrir esta página ou ao{" "}
        <strong>Atualizar lista</strong>; pode abrir novamente o workspace ou exportar ao Spaces desde aqui sem ir ao separador Product Score.
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
          <strong>Lista</strong> — mais recentes primeiro (histórico local neste browser).
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
            Atualizar lista
          </button>
          {recentPages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearRecentWorkspace();
                setRecentPages([]);
                setDetails({});
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

        {exportFlash ? (
          <p
            role="status"
            style={{
              fontSize: "0.7rem",
              marginBottom: "0.45rem",
              padding: "0.35rem 0.5rem",
              borderRadius: 6,
              background: exportFlash.kind === "ok" ? "rgba(40, 120, 80, 0.2)" : "rgba(180, 60, 60, 0.18)",
              color: exportFlash.kind === "ok" ? "#b8e6c8" : "#ffb3b3"
            }}
          >
            {exportFlash.text}
          </p>
        ) : null}

        {rowsSorted.length > 0 ? (
          <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {rowsSorted.map((r) => {
              const d = details[r.productId];
              const nome = (d?.nome || r.nome || "—").trim() || "—";
              const loading = d?.loading !== false && d?.preco == null && d?.error == null;
              const showVals = loading ? "…" : (v) => (v == null || v === "" ? "—" : String(v));
              /** @type {import("./productStatusStorage.js").ProductStatusKey} */
              const rowStatus = statusMap[r.productId] ?? PRODUCT_STATUS_DEFAULT;
              const bs = badgeStyleForStatus(rowStatus);

              return (
                <li
                  key={r.productId}
                  style={{
                    border: "1px solid #2f3f4d",
                    borderRadius: 8,
                    padding: "0.55rem 0.65rem",
                    background: "#111820",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.5rem",
                    alignItems: "stretch"
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        marginBottom: "0.38rem",
                        flexWrap: "wrap"
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.82rem",
                          color: "#e7e9ea",
                          lineHeight: 1.35,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: "1 1 auto",
                          minWidth: "8rem"
                        }}
                        title={`${nome} · ${r.productId}`}
                      >
                        {nome.length > 80 ? `${nome.slice(0, 77)}…` : nome}
                      </div>
                      <span
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          padding: "0.2rem 0.45rem",
                          borderRadius: 6,
                          flex: "0 0 auto",
                          ...bs
                        }}
                      >
                        {labelForProductStatus(rowStatus)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(7rem, 1fr))",
                        gap: "0.35rem 0.85rem",
                        fontSize: "0.74rem",
                        opacity: 0.88,
                        fontVariantNumeric: "tabular-nums"
                      }}
                    >
                      <span>
                        <span style={{ opacity: 0.65 }}>Preço</span> {loading ? "…" : showVals(d?.preco)}
                      </span>
                      <span>
                        <span style={{ opacity: 0.65 }}>Vendas</span> {loading ? "…" : showVals(d?.vendas)}
                      </span>
                      <span>
                        <span style={{ opacity: 0.65 }}>Rating</span> {loading ? "…" : showVals(d?.rating)}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: "0.45rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.28rem",
                        alignItems: "center"
                      }}
                      role="group"
                      aria-label="Estado da análise"
                    >
                      <span style={{ fontSize: "0.62rem", opacity: 0.65, marginRight: "0.15rem", width: "100%" }}>Estado:</span>
                      {PRODUCT_STATUS_OPTIONS.map((opt) => {
                        const active = rowStatus === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => onPickStatus(r.productId, opt.key)}
                            style={{
                              padding: "0.22rem 0.42rem",
                              fontSize: "0.62rem",
                              fontWeight: active ? 700 : 500,
                              cursor: "pointer",
                              borderRadius: 5,
                              border: active ? "2px solid #6ec4ff" : "1px solid #3d4b5c",
                              background: active ? "#253545" : "#1a2430",
                              color: active ? "#e7f4ff" : "#b8cad8"
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {d?.error ? (
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.65rem", opacity: 0.75, color: "#f0a08a", lineHeight: 1.35 }}>
                        API: {d.error.length > 160 ? `${d.error.slice(0, 157)}…` : d.error}
                      </p>
                    ) : null}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                      justifyContent: "center",
                      alignItems: "stretch",
                      flex: "0 0 auto",
                      minWidth: "8.25rem"
                    }}
                  >
                    <Link to={`/produto/${encodeURIComponent(r.productId)}`} title="Abrir workspace do produto" style={btnOpen}>
                      Abrir produto
                    </Link>
                    <button
                      type="button"
                      style={{
                        ...btnExport,
                        opacity: exportingId === r.productId ? 0.55 : 1,
                        cursor: exportingId != null ? "wait" : "pointer"
                      }}
                      disabled={exportingId != null}
                      onClick={() => onExport(r.productId)}
                    >
                      {exportingId === r.productId ? "…" : "Exportar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.78rem",
              opacity: 0.78,
              lineHeight: 1.55,
              maxWidth: "28rem",
              whiteSpace: "pre-line"
            }}
          >
            Você ainda não abriu nenhum produto.{"\n"}
            Volte ao Analytics e clique no nome de um produto para começar a análise.
          </p>
        )}
      </section>
    </div>
  );
}
