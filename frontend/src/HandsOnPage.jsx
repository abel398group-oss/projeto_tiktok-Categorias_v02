import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";
import PdpEnrichButton from "./PdpEnrichButton.jsx";
import {
  CREATOR_SHORTLIST_CHANGED_EVENT,
  CREATOR_SHORTLIST_STORAGE_KEY,
  getCreatorShortlist
} from "./productShortlistStorage.js";
import {
  PRODUCT_STATUS_STORAGE_KEY,
  badgeTextForProductStatus,
  getProductStatuses,
  PRODUCT_STATUS_OPTIONS,
  normalizeProductStatusKey,
  setProductStatus
} from "./productStatusStorage.js";
import { clearRecentWorkspace, getRecentWorkspace } from "./recentWorkspace.js";
import {
  CHOSEN_PRODUCTS_CHANGED_EVENT,
  CHOSEN_PRODUCTS_STORAGE_KEY,
  getChosenProducts,
  removeChosenProduct
} from "./productChosenStorage.js";

const NOTES_LS_PREFIX = "tiktok-analytics-product-notes:";

/** @param {string} productId */
function userNotePreview(productId) {
  try {
    const raw = localStorage.getItem(`${NOTES_LS_PREFIX}${productId}`);
    if (!raw || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return t.length > 100 ? `${t.slice(0, 97)}…` : t;
  } catch {
    return null;
  }
}

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

/** Máximo de GETs paralelos a `product-workspace` na tab Recentes (alivia backend e ambientes lentos). */
const RECENT_WORKSPACE_FETCH_CONCURRENCY = 4;

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  if (items.length === 0) return [];
  /** @type {R[]} */
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  const runWorker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
  return results;
}

/** @typedef {{ loading?: boolean, preco?: unknown, vendas?: unknown, rating?: unknown, nome?: string, error?: string | null, workspaceNote?: string | null }} RowDetail */

/** @typedef {"escolhidos" | "recentes" | "estagios" | "shortlist"} HandsOnTab */

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
  textAlign: "center"
};

/** @param {import("./productStatusStorage.js").ProductStatusKey} key */
function badgeStyleForStatus(key) {
  const k = normalizeProductStatusKey(key);
  switch (k) {
    case "descoberto":
      return {
        background: "#1e2a38",
        color: "#a8c4dc",
        border: "1px solid #3d556d"
      };
    case "em_analise":
      return {
        background: "#2a3038",
        color: "#9ca3af",
        border: "1px solid #4b5563"
      };
    case "em_teste":
      return {
        background: "#422006",
        color: "#fcd34d",
        border: "1px solid #d97706"
      };
    case "conteudo_produzido":
      return {
        background: "#1e3a5f",
        color: "#93c5fd",
        border: "1px solid #2563eb"
      };
    case "publicado":
      return {
        background: "#14532d",
        color: "#bbf7d0",
        border: "1px solid #22c55e"
      };
    case "descartado":
      return {
        background: "#450a0a",
        color: "#fca5a5",
        border: "1px solid #dc2626"
      };
    default:
      return {
        background: "#1e2a38",
        color: "#a8c4dc",
        border: "1px solid #3d556d"
      };
  }
}

const tabBtnBase = {
  padding: "0.38rem 0.72rem",
  fontSize: "0.76rem",
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 7,
  border: "1px solid #3d4b5c",
  background: "#1a2430",
  color: "#b8cad8"
};

/**
 * Hub operacional creator — `/a-mao`: recentes, vista por pipeline, resumo da shortlist.
 */
export default function HandsOnPage() {
  /** @type {HandsOnTab} */
  const [activeTab, setActiveTab] = useState(/** @type {HandsOnTab} */ ("escolhidos"));
  const [chosenProducts, setChosenProducts] = useState(() => getChosenProducts());
  /** @type {[{ productId: string, nome?: string, at?: string }, ...]} */
  const [recentPages, setRecentPages] = useState(() => sortRecentNewestFirst(getRecentWorkspace()));
  /** @type {import("./productShortlistStorage.js").CreatorShortlistEntry[]} */
  const [shortlistSnapshot, setShortlistSnapshot] = useState(() => getCreatorShortlist());
  /** @type {Record<string, import("./productStatusStorage.js").ProductStatusKey>} */
  const [statusMap, setStatusMap] = useState(() => getProductStatuses());
  /** @type {Record<string, RowDetail>} */
  const [details, setDetails] = useState({});
  const [exportingId, setExportingId] = useState(/** @type {string | null} */ (null));
  const [exportById, setExportById] = useState(
    /** @type {Record<string, { kind: "ok" | "err"; text: string }>} */ ({})
  );
  const [localExportingId, setLocalExportingId] = useState(/** @type {string | null} */ (null));
  const [localExportById, setLocalExportById] = useState(
    /** @type {Record<string, { kind: "ok" | "err"; text: string }>} */ ({})
  );
  const [exportFlash, setExportFlash] = useState(
    /** @type {{ kind: "ok" | "err"; text: string } | null} */ (null)
  );

  const refreshRecent = useCallback(() => {
    setRecentPages(sortRecentNewestFirst(getRecentWorkspace()));
    setStatusMap(getProductStatuses());
    setShortlistSnapshot(getCreatorShortlist());
    setExportFlash(null);
  }, []);

  useEffect(() => {
    if (activeTab === "shortlist") {
      setShortlistSnapshot(getCreatorShortlist());
    }
  }, [activeTab]);

  useEffect(() => {
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
      if (
        e.key === PRODUCT_STATUS_STORAGE_KEY ||
        e.key === CREATOR_SHORTLIST_STORAGE_KEY ||
        e.key === CHOSEN_PRODUCTS_STORAGE_KEY ||
        e.key === null
      ) {
        setStatusMap(getProductStatuses());
        setShortlistSnapshot(getCreatorShortlist());
        setChosenProducts(getChosenProducts());
      }
    };
    const onShortlistSameTab = () => {
      setShortlistSnapshot(getCreatorShortlist());
    };
    const onChosenSameTab = () => {
      setChosenProducts(getChosenProducts());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CREATOR_SHORTLIST_CHANGED_EVENT, onShortlistSameTab);
    window.addEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, onChosenSameTab);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CREATOR_SHORTLIST_CHANGED_EVENT, onShortlistSameTab);
      window.removeEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, onChosenSameTab);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const ids = chosenProducts.map((r) => r.productId).filter(Boolean);
    if (ids.length === 0) {
      setDetails({});
      return undefined;
    }

    setDetails((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { ...next[id], loading: true, error: next[id]?.error ?? null, workspaceNote: next[id]?.workspaceNote ?? null };
      }
      return next;
    });

    (async () => {
      const results = await mapWithConcurrency(ids, RECENT_WORKSPACE_FETCH_CONCURRENCY, async (id) => {
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
      });

      if (cancel) return;

      setDetails((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.ok && r.payload) {
            /** @type {Record<string, unknown>} */
            const p = r.payload;
            const fromLatest = p.snapshotFromLatestGlobalRun;
            const note =
              typeof fromLatest === "boolean" &&
              !fromLatest &&
              typeof p.deltaHint === "string" &&
              p.deltaHint.trim() !== ""
                ? p.deltaHint
                : null;
            next[r.id] = {
              loading: false,
              preco: p.preco ?? "—",
              vendas: p.vendas ?? "—",
              rating: p.rating ?? "—",
              nome: typeof p.nome === "string" ? p.nome : undefined,
              link: typeof p.link === "string" ? p.link : null,
              hasPdpImages: Boolean(p.hasPdpImages),
              enriched: Boolean(p.enriched),
              error: null,
              workspaceNote: note
            };
          } else if (!r.ok) {
            next[r.id] = {
              loading: false,
              preco: "—",
              vendas: "—",
              rating: "—",
              link: null,
              hasPdpImages: false,
              enriched: false,
              error: typeof r.err === "string" ? r.err : "—",
              workspaceNote: null
            };
          }
        }
        return next;
      });
    })();

    return () => {
      cancel = true;
    };
  }, [chosenProducts]);

  /** @param {string} pid @param {import("./productStatusStorage.js").ProductStatusKey} statusKey */
  const onPickStatus = useCallback((pid, statusKey) => {
    setProductStatus(pid, statusKey);
    setStatusMap(getProductStatuses());
  }, []);

  const onExport = useCallback(async (productId) => {
    const pid = String(productId ?? "").trim();
    if (!pid) return;
    setExportById((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    setExportFlash({ kind: "ok", text: "Exportação iniciada" });
    setExportById((prev) => ({ ...prev, [pid]: { kind: "ok", text: "Exportação iniciada" } }));
    setExportingId(pid);
    try {
      const res = await apiPost("/analytics/images-upload", { productId: pid });
      const stats = res && typeof res === "object" && res.stats && typeof res.stats === "object" ? res.stats : null;
      const uploaded = stats && Number.isFinite(Number(stats.uploaded)) ? Number(stats.uploaded) : null;
      const failed = stats && Number.isFinite(Number(stats.failed)) ? Number(stats.failed) : null;
      const skipped = stats && Number.isFinite(Number(stats.skippedExists)) ? Number(stats.skippedExists) : null;
      const ms = Number.isFinite(Number(res.ms)) ? Number(res.ms) : null;

      const bits = [];
      if (uploaded != null) bits.push(`enviadas: ${uploaded.toLocaleString("pt-BR")}`);
      if (skipped != null) bits.push(`reutilizadas: ${skipped.toLocaleString("pt-BR")}`);
      if (failed != null) bits.push(`falhas: ${failed.toLocaleString("pt-BR")}`);
      if (ms != null) bits.push(`tempo: ${(ms / 1000).toFixed(1)}s`);

      setProductStatus(pid, "conteudo_produzido");
      setStatusMap(getProductStatuses());
      const msg = `Exportação concluída${bits.length ? " · " + bits.join(" · ") : ""}`;
      setExportFlash({ kind: "ok", text: msg });
      setExportById((prev) => ({ ...prev, [pid]: { kind: "ok", text: msg } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errMsg = `Falha ao exportar: ${msg}`;
      setExportFlash({ kind: "err", text: errMsg });
      setExportById((prev) => ({ ...prev, [pid]: { kind: "err", text: errMsg } }));
    } finally {
      setExportingId(null);
    }
  }, []);

  const onExportLocal = useCallback(async (productId) => {
    const pid = String(productId ?? "").trim();
    if (!pid) return;
    setLocalExportById((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    setLocalExportById((prev) => ({ ...prev, [pid]: { kind: "ok", text: "Exportação local iniciada" } }));
    setLocalExportingId(pid);
    try {
      const res = await apiPost("/analytics/export-local", { productId: pid });
      const dir = res && typeof res === "object" && typeof res.dir === "string" ? res.dir.trim() : "";
      const saved = res && typeof res === "object" && Number.isFinite(Number(res.imagesSaved)) ? Number(res.imagesSaved) : null;
      const failed = res && typeof res === "object" && Number.isFinite(Number(res.imagesFailed)) ? Number(res.imagesFailed) : null;
      const bits = [];
      if (saved != null) bits.push(`imagens: ${saved.toLocaleString("pt-BR")}`);
      if (failed != null) bits.push(`falhas: ${failed.toLocaleString("pt-BR")}`);
      const msg = `Exportação local concluída${bits.length ? " · " + bits.join(" · ") : ""}${dir ? ` · ${dir}` : ""}`;
      setLocalExportById((prev) => ({ ...prev, [pid]: { kind: "ok", text: msg } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errMsg = `Falha ao exportar local: ${msg}`;
      setLocalExportById((prev) => ({ ...prev, [pid]: { kind: "err", text: errMsg } }));
    } finally {
      setLocalExportingId(null);
    }
  }, []);

  const onRemoveChosen = useCallback((productId) => {
    removeChosenProduct(productId);
    setChosenProducts(getChosenProducts());
    setExportFlash({ kind: "ok", text: "Produto removido" });
  }, []);

  const rowsSorted = useMemo(() => recentPages, [recentPages]);

  /** @type {{ productId: string, displayNome: string, status: import("./productStatusStorage.js").ProductStatusKey }[]} */
  const unionStageRows = useMemo(() => {
    const ids = new Set([
      ...recentPages.map((r) => r.productId).filter(Boolean),
      ...shortlistSnapshot.map((e) => e.productId),
      ...Object.keys(statusMap)
    ]);
    /** @type {{ productId: string, displayNome: string, status: import("./productStatusStorage.js").ProductStatusKey }[]} */
    const rows = [];
    const shortById = new Map(shortlistSnapshot.map((e) => [e.productId, e]));
    const recentById = new Map(recentPages.map((r) => [r.productId, r]));
    for (const productId of ids) {
      const d = details[productId];
      const sh = shortById.get(productId);
      const rc = recentById.get(productId);
      const fromApi = d?.nome && String(d.nome).trim();
      const fromShort = sh?.nome && String(sh.nome).trim() && sh.nome !== "—" ? sh.nome.trim() : "";
      const fromRecent = rc?.nome && String(rc.nome).trim() ? String(rc.nome).trim() : "";
      const displayNome = (fromApi || fromShort || fromRecent || productId).trim() || productId;
      const status = normalizeProductStatusKey(statusMap[productId]);
      rows.push({ productId, displayNome, status });
    }
    rows.sort((a, b) => a.displayNome.localeCompare(b.displayNome, "pt"));
    return rows;
  }, [recentPages, shortlistSnapshot, statusMap, details]);

  const byStage = useMemo(() => {
    /** @type {Record<string, typeof unionStageRows>} */
    const buckets = {};
    for (const opt of PRODUCT_STATUS_OPTIONS) {
      buckets[opt.key] = [];
    }
    for (const row of unionStageRows) {
      if (buckets[row.status]) buckets[row.status].push(row);
    }
    return buckets;
  }, [unionStageRows]);

  const shortlistPreview = useMemo(() => shortlistSnapshot.slice(0, 5), [shortlistSnapshot]);

  const tabBar = (
    <div
      role="tablist"
      aria-label="Vistas do hub operacional"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.85rem" }}
    >
      {(
        /** @type {{ id: HandsOnTab, label: string }[]} */ ([
          { id: "escolhidos", label: "Escolhidos" }
        ])
      ).map((t) => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...tabBtnBase,
              border: active ? "1px solid #6ec4ff" : tabBtnBase.border,
              background: active ? "#253545" : tabBtnBase.background,
              color: active ? "#e7f4ff" : tabBtnBase.color,
              fontWeight: active ? 700 : 600
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Produtos em análise</h1>
        <p style={{ fontSize: "0.82rem", opacity: 0.9, margin: "0 0 0.45rem", maxWidth: "44rem", lineHeight: 1.55 }}>
          <strong>Workspace operacional</strong> — lista manual de produtos <strong>escolhidos</strong> a partir do <strong>Product Score</strong>.
        </p>
        <p style={{ fontSize: "0.78rem", opacity: 0.78, margin: "0 0 1rem", maxWidth: "44rem", lineHeight: 1.5 }}>
          Esta página não executa scraping nem abre navegador. As ações disponíveis são: Abrir workspace, Abrir no TikTok, Enriquecer PDP e Exportar.
        </p>
        <p style={{ fontSize: "0.75rem", opacity: 0.65, margin: "0 0 0.75rem", maxWidth: "44rem", lineHeight: 1.45 }}>
          Dados salvos apenas neste navegador.
        </p>

        {tabBar}

        {exportFlash ? (
          <p
            role="status"
            style={{
              fontSize: "0.7rem",
              marginBottom: "0.65rem",
              padding: "0.35rem 0.5rem",
              borderRadius: 6,
              background: exportFlash.kind === "ok" ? "rgba(40, 120, 80, 0.2)" : "rgba(180, 60, 60, 0.18)",
              color: exportFlash.kind === "ok" ? "#b8e6c8" : "#ffb3b3"
            }}
          >
            {exportFlash.text}
          </p>
        ) : null}

        {activeTab === "escolhidos" ? (
          <section
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 0.85rem",
              borderRadius: 8,
              border: "1px solid #2a3844",
              background: "#151e27"
            }}
          >
            <div style={{ fontSize: "0.76rem", opacity: 0.9, marginBottom: "0.5rem", lineHeight: 1.45 }}>
              <strong>Escolhidos</strong> — lista manual a partir do Product Score. ({chosenProducts.length})
            </div>

            {chosenProducts.length > 0 ? (
              <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {chosenProducts.map((r) => {
                  const d = details[r.productId];
                  /** @type {import("./productStatusStorage.js").ProductStatusKey} */
                  const rowStatus = normalizeProductStatusKey(statusMap[r.productId]);
                  const nome = (d?.nome || r.nome || "—").trim() || "—";
                  const exportState = exportById[r.productId];
                  const exportDone =
                    exportState?.kind === "ok" &&
                    typeof exportState.text === "string" &&
                    exportState.text.startsWith("Exportação concluída");
                  const localState = localExportById[r.productId];
                  const localDone =
                    localState?.kind === "ok" &&
                    typeof localState.text === "string" &&
                    localState.text.startsWith("Exportação local concluída");
                  const tiktokUrl =
                    (typeof d?.link === "string" && d.link.trim()) ||
                    (typeof r.tiktokUrl === "string" && r.tiktokUrl.trim()) ||
                    `https://www.tiktok.com/shop/br/pdp/${encodeURIComponent(r.productId)}`;

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
                        gap: "0.8rem",
                        alignItems: "stretch"
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#e7e9ea", lineHeight: 1.35, wordBreak: "break-word" }}>
                            {nome}
                          </div>
                          {rowStatus === "em_teste" ? (
                            <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "0.14rem 0.42rem", borderRadius: 999, background: "rgba(59, 130, 246, 0.18)", color: "#cfe6ff" }}>
                              EM TESTE
                            </span>
                          ) : null}
                          {rowStatus === "conteudo_produzido" ? (
                            <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "0.14rem 0.42rem", borderRadius: 999, background: "rgba(34, 197, 94, 0.16)", color: "#c9f7d7" }}>
                              EXPORTADO
                            </span>
                          ) : null}
                          {d?.enriched || d?.hasPdpImages ? (
                            <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "0.14rem 0.42rem", borderRadius: 999, background: "rgba(168, 85, 247, 0.16)", color: "#f0d7ff" }}>
                              PDP enriquecido
                            </span>
                          ) : null}
                        </div>

                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.66rem", opacity: 0.75, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                          {r.productId}
                        </p>

                        {d?.error ? (
                          <p style={{ margin: "0.35rem 0 0", fontSize: "0.7rem", opacity: 0.9, color: "#f0a08a", lineHeight: 1.35 }}>
                            Erro ao carregar dados (API): {String(d.error)}
                          </p>
                        ) : null}

                        {!d?.error && (d?.preco != null || d?.vendas != null || d?.rating != null) ? (
                          <p style={{ margin: "0.35rem 0 0", fontSize: "0.74rem", opacity: 0.86, lineHeight: 1.5 }}>
                            preço: <strong>{d?.preco ?? "—"}</strong> · vendas: <strong>{d?.vendas ?? "—"}</strong> · rating:{" "}
                            <strong>{d?.rating ?? "—"}</strong>
                          </p>
                        ) : null}

                        {d?.workspaceNote ? (
                          <div
                            style={{
                              margin: "0.4rem 0 0",
                              padding: "0.4rem 0.5rem",
                              borderRadius: 6,
                              border: "1px solid rgba(56, 189, 248, 0.22)",
                              background: "rgba(14, 165, 233, 0.06)"
                            }}
                          >
                            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.04em", opacity: 0.88, color: "#7dd3fc", marginBottom: "0.2rem" }}>
                              Contexto dos dados (API)
                            </div>
                            <p style={{ margin: 0, fontSize: "0.63rem", opacity: 0.82, color: "#b8d4e8", lineHeight: 1.42 }}>
                              {String(d.workspaceNote).length > 200 ? `${String(d.workspaceNote).slice(0, 197)}…` : String(d.workspaceNote)}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "stretch", minWidth: "10rem" }}>
                        <Link to={`/produto/${encodeURIComponent(r.productId)}`} title="Abrir workspace do produto" className="tk-btn-primary" style={btnOpen}>
                          Abrir workspace
                        </Link>
                        <a href={tiktokUrl} target="_blank" rel="noopener noreferrer" className="tk-btn-neutral" style={btnOpen}>
                          Abrir no TikTok
                        </a>
                        <PdpEnrichButton productId={r.productId} />
                        <button
                          type="button"
                          aria-busy={localExportingId === r.productId}
                          style={{
                            ...btnOpen,
                            borderRadius: 8,
                            border: localDone ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid #45515c",
                            background: localDone ? "rgba(34, 197, 94, 0.12)" : "#1a2733",
                            color: localDone ? "#dcedc8" : "#e7e9ea",
                            fontWeight: 700,
                            opacity: localExportingId === r.productId ? 0.6 : 1,
                            cursor: localExportingId != null ? "wait" : "pointer"
                          }}
                          disabled={localExportingId != null || exportingId != null}
                          onClick={() => void onExportLocal(r.productId)}
                          title="Exporta kit local do produto no Windows (não faz scraping)"
                        >
                          {localExportingId === r.productId
                            ? "Exportando local…"
                            : localDone
                              ? "Exportar local ✓"
                              : "Exportar local"}
                        </button>
                        {localExportById[r.productId] ? (
                          <div
                            role="status"
                            style={{
                              fontSize: "0.62rem",
                              lineHeight: 1.35,
                              opacity: 0.92,
                              color: localExportById[r.productId].kind === "ok" ? "#9dd4b8" : "#f0a08a"
                            }}
                          >
                            {localExportById[r.productId].text}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          aria-busy={exportingId === r.productId}
                          style={{
                            ...btnOpen,
                            borderRadius: 8,
                            border: exportDone ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid #567138",
                            background: exportDone ? "rgba(34, 197, 94, 0.12)" : "#203014",
                            color: "#dcedc8",
                            fontWeight: 700,
                            opacity: exportingId === r.productId ? 0.6 : 1,
                            cursor: exportingId != null ? "wait" : "pointer"
                          }}
                          disabled={exportingId != null}
                          onClick={() => void onExport(r.productId)}
                          title="Exporta imagens para o DigitalOcean Spaces (não faz scraping)"
                        >
                          {exportingId === r.productId ? "Exportando…" : exportDone ? "Exportar ✓" : "Exportar"}
                        </button>
                        {exportById[r.productId] ? (
                          <div
                            role="status"
                            style={{
                              fontSize: "0.62rem",
                              lineHeight: 1.35,
                              opacity: 0.92,
                              color: exportById[r.productId].kind === "ok" ? "#9dd4b8" : "#f0a08a"
                            }}
                          >
                            {exportById[r.productId].text}
                          </div>
                        ) : null}
                        <button type="button" className="tk-btn-danger" style={{ ...btnOpen, fontWeight: 700 }} onClick={() => onRemoveChosen(r.productId)}>
                          Remover
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.78, lineHeight: 1.55, maxWidth: "34rem" }}>
                Nenhum produto escolhido ainda. Vá ao <strong>Product Score</strong> e use o botão <strong>Escolher</strong>.
              </p>
            )}
          </section>
        ) : null}

        {activeTab === "recentes" ? (
          <section
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 0.85rem",
              borderRadius: 8,
              border: "1px solid #2a3844",
              background: "#151e27"
            }}
          >
            <div style={{ fontSize: "0.76rem", opacity: 0.9, marginBottom: "0.5rem", lineHeight: 1.45 }}>
              <strong>Recentes</strong> — do mais recente para o mais antigo.
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

            {rowsSorted.length > 0 ? (
              <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {rowsSorted.map((r) => {
                  const d = details[r.productId];
                  const nome = (d?.nome || r.nome || "—").trim() || "—";
                  const loading = d?.loading !== false && d?.preco == null && d?.error == null;
                  const showVals = loading ? "…" : (v) => (v == null || v === "" ? "—" : String(v));
                  /** @type {import("./productStatusStorage.js").ProductStatusKey} */
                  const rowStatus = normalizeProductStatusKey(statusMap[r.productId]);
                  const bs = badgeStyleForStatus(rowStatus);
                  const noteUser = userNotePreview(r.productId);

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
                        gap: "0.8rem",
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
                            {badgeTextForProductStatus(rowStatus)}
                          </span>
                        </div>
                        <p style={{ margin: "0 0 0.35rem", fontSize: "0.65rem", fontFamily: "ui-monospace, monospace", opacity: 0.72, wordBreak: "break-all" }}>
                          {r.productId}
                        </p>
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
                          aria-label="Pipeline do produto"
                        >
                          <span style={{ fontSize: "0.62rem", opacity: 0.65, marginRight: "0.15rem", width: "100%" }}>Pipeline:</span>
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
                                <span aria-hidden>{opt.emoji}</span> {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {d?.error ? (
                          <p style={{ margin: "0.35rem 0 0", fontSize: "0.65rem", opacity: 0.75, color: "#f0a08a", lineHeight: 1.35 }}>
                            <span style={{ fontWeight: 700, opacity: 0.9 }}>Erro ao carregar · </span>
                            {d.error.length > 160 ? `${d.error.slice(0, 157)}…` : d.error}
                          </p>
                        ) : null}
                        {!d?.error && d?.workspaceNote ? (
                          <div
                            style={{
                              margin: "0.4rem 0 0",
                              padding: "0.4rem 0.5rem",
                              borderRadius: 6,
                              border: "1px solid rgba(56, 189, 248, 0.22)",
                              background: "rgba(14, 165, 233, 0.06)"
                            }}
                          >
                            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.04em", opacity: 0.88, color: "#7dd3fc", marginBottom: "0.2rem" }}>
                              Contexto dos dados (API)
                            </div>
                            <p style={{ margin: 0, fontSize: "0.63rem", opacity: 0.82, color: "#b8d4e8", lineHeight: 1.42 }}>
                              {d.workspaceNote.length > 200 ? `${d.workspaceNote.slice(0, 197)}…` : d.workspaceNote}
                            </p>
                          </div>
                        ) : null}
                        {noteUser ? (
                          <p style={{ margin: "0.4rem 0 0", fontSize: "0.63rem", opacity: 0.88, color: "#e8dcc8", lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, opacity: 0.95 }}>Minhas notas · </span>
                            <span style={{ fontStyle: "italic" }}>{noteUser}</span>
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
                        <Link to={`/produto/${encodeURIComponent(r.productId)}`} title="Abrir workspace do produto" className="tk-btn-primary" style={btnOpen}>
                          Abrir workspace
                        </Link>
                        <PdpEnrichButton productId={r.productId} />
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
        ) : null}

        {activeTab === "estagios" ? (
          <section
            style={{
              marginBottom: "1rem",
              padding: "0.65rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #2a3844",
              background: "#151e27"
            }}
          >
            <div style={{ fontSize: "0.74rem", opacity: 0.88, marginBottom: "0.65rem", lineHeight: 1.45 }}>
              <strong>Por estágio</strong> — mesma união de fontes (recentes, shortlist, pipeline). Sem título guardado, vê-se o <code>productId</code>.
            </div>
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
                color: "#e7e9ea",
                marginBottom: "0.75rem"
              }}
            >
              Atualizar dados locais
            </button>
            {PRODUCT_STATUS_OPTIONS.map((opt) => {
              const list = byStage[opt.key] ?? [];
              return (
                <div key={opt.key} style={{ marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "0.82rem", fontWeight: 700, margin: "0 0 0.4rem", color: "#dbe8f4" }}>
                    <span aria-hidden>{opt.emoji}</span> {opt.label}{" "}
                    <span style={{ fontSize: "0.7rem", opacity: 0.65, fontWeight: 500 }}>({list.length})</span>
                  </h2>
                  {list.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.72rem", opacity: 0.65 }}>Nenhum produto neste estágio.</p>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {list.map((row) => {
                        const noteUser = userNotePreview(row.productId);
                        return (
                          <li
                            key={row.productId}
                            style={{
                              border: "1px solid #2f3f4d",
                              borderRadius: 8,
                              padding: "0.5rem 0.6rem",
                              background: "#111820",
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: "0.45rem",
                              alignItems: "start"
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#e7e9ea", lineHeight: 1.35, wordBreak: "break-word" }}>
                                {row.displayNome}
                              </div>
                              <p style={{ margin: "0.25rem 0 0", fontSize: "0.65rem", fontFamily: "ui-monospace, monospace", opacity: 0.7, wordBreak: "break-all" }}>
                                {row.productId}
                              </p>
                              {noteUser ? (
                                <p style={{ margin: "0.3rem 0 0", fontSize: "0.62rem", opacity: 0.85, color: "#e8dcc8", lineHeight: 1.4 }}>
                                  <span style={{ fontWeight: 700 }}>Minhas notas · </span>
                                  <span style={{ fontStyle: "italic" }}>{noteUser}</span>
                                </p>
                              ) : null}
                              <div style={{ marginTop: "0.4rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                                {PRODUCT_STATUS_OPTIONS.map((o) => {
                                  const active = row.status === o.key;
                                  return (
                                    <button
                                      key={o.key}
                                      type="button"
                                      onClick={() => onPickStatus(row.productId, o.key)}
                                      style={{
                                        padding: "0.18rem 0.36rem",
                                        fontSize: "0.58rem",
                                        fontWeight: active ? 700 : 500,
                                        cursor: "pointer",
                                        borderRadius: 5,
                                        border: active ? "2px solid #6ec4ff" : "1px solid #3d4b5c",
                                        background: active ? "#253545" : "#1a2430",
                                        color: active ? "#e7f4ff" : "#b8cad8"
                                      }}
                                    >
                                      {o.emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: "7.5rem" }}>
                              <Link to={`/produto/${encodeURIComponent(row.productId)}`} className="tk-btn-primary" style={btnOpen}>
                                Abrir
                              </Link>
                              <button
                                type="button"
                                style={{
                                  ...btnExport,
                                  opacity: exportingId === row.productId ? 0.55 : 1,
                                  cursor: exportingId != null ? "wait" : "pointer"
                                }}
                                disabled={exportingId != null}
                                onClick={() => onExport(row.productId)}
                              >
                                {exportingId === row.productId ? "…" : "Exportar"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ) : null}

        {activeTab === "shortlist" ? (
          <section
            style={{
              marginBottom: "1rem",
              padding: "0.65rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #2a3844",
              background: "#151e27"
            }}
          >
            <h2 style={{ fontSize: "0.88rem", fontWeight: 700, margin: "0 0 0.35rem", color: "#dbe8f4" }}>Shortlist</h2>
            <p style={{ margin: "0 0 0.65rem", fontSize: "0.76rem", opacity: 0.85, lineHeight: 1.5 }}>
              <strong>{shortlistSnapshot.length}</strong> favorito{shortlistSnapshot.length === 1 ? "" : "s"}. A lista completa está em <strong>Minha shortlist</strong>.
            </p>
            {shortlistSnapshot.length === 0 ? (
              <p style={{ fontSize: "0.78rem", opacity: 0.78, lineHeight: 1.55, margin: "0 0 0.65rem" }}>
                Nenhum favorito ainda. Abra um produto no workspace e use <strong>Favoritar</strong>.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: "0 0 0.75rem", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {shortlistPreview.map((e) => (
                  <li key={e.productId} style={{ fontSize: "0.78rem" }}>
                    <Link
                      to={`/produto/${encodeURIComponent(e.productId)}`}
                      style={{ color: "#8ecdfa", fontWeight: 600, textDecoration: "none" }}
                    >
                      {e.nome}
                    </Link>
                    <span style={{ opacity: 0.65, fontSize: "0.68rem", display: "block", marginTop: "0.15rem", fontFamily: "ui-monospace, monospace" }}>
                      {e.productId}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/shortlist"
              style={{
                ...btnOpen,
                display: "inline-block",
                marginTop: shortlistSnapshot.length ? "0.25rem" : 0
              }}
            >
              Ver shortlist completa →
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
