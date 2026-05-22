import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, apiPost, apiPostBlob } from "./api.js";
import PdpEnrichButton from "./PdpEnrichButton.jsx";
import { buildProductBriefingFromWorkspace } from "./productBriefing.js";
import { deriveProductLabels } from "./productLabels.js";
import {
  PRODUCT_STATUS_DEFAULT,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_STORAGE_KEY,
  badgeTextForProductStatus,
  getProductStatusForProduct,
  normalizeProductStatusKey,
  productStatusMeta,
  setProductStatus
} from "./productStatusStorage.js";
import {
  CREATOR_SHORTLIST_CHANGED_EVENT,
  CREATOR_SHORTLIST_STORAGE_KEY,
  isProductInShortlist,
  toggleCreatorShortlist
} from "./productShortlistStorage.js";
import { pushRecentWorkspace } from "./recentWorkspace.js";
import { firstFloat, parseDelta } from "./sortUtils.js";
import { getTicketLabel } from "./ticketLabel.js";

const NOTES_LS_PREFIX = "tiktok-analytics-product-notes:";
const NOTES_MAX = 20_000;

function notesStorageKey(productId) {
  return `${NOTES_LS_PREFIX}${productId}`;
}

/** @typedef {{
 * scrapeRun?: { id: string, collectedAt: string },
 * productId?: string,
 * nome?: string,
 * loja?: string,
 * score?: number,
 * classific?: string,
 * preco?: string | number,
 * vendas?: string | number,
 * rating?: string,
 * ratingAverage?: number | null,
 * ratingTotal?: number | null,
 * deltaVendas?: string,
 * motivos?: string,
 * link?: string,
 * categoryUrl?: string | null,
 * imageUrls?: string[],
 * message?: string
 * }} WorkspacePayload */

const box = {
  background: "#192734",
  border: "1px solid #38444d",
  borderRadius: 8,
  padding: "0.85rem 1rem",
  marginBottom: "0.85rem"
};

const labelMuted = { fontSize: "0.7rem", opacity: 0.75, marginBottom: "0.25rem" };

const subsectionTitle = {
  fontSize: "0.65rem",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  opacity: 0.82,
  color: "#9eb5c9",
  margin: "0 0 0.5rem",
  paddingTop: "0.05rem"
};

const divider = {
  border: "none",
  borderTop: "1px solid #273440",
  margin: "0.75rem 0"
};

/** @param {{ children?: import("react").ReactNode, title: string }} p */
function Subsection({ title, children }) {
  return (
    <div style={{ marginTop: 0 }}>
      <h3 style={subsectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

const copyBtnMini = {
  marginLeft: "0.35rem",
  fontSize: "0.62rem",
  padding: "0.1rem 0.38rem",
  cursor: "pointer",
  borderRadius: 4,
  border: "1px solid #45515c",
  background: "#22303c",
  color: "#e7e9ea",
  verticalAlign: "middle"
};

function fmtNumberPt(n, opts = {}) {
  if (n == null || typeof n !== "number" || Number.isNaN(n)) return "—";
  const d = opts.decimals ?? 2;
  const rounded = Number(n.toFixed(d));
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: d
  }).format(rounded);
}

/** Percentual já em forma decimal típica (ex. 0,05 = 5%) quando |n| &lt; 1 */
/** @param {unknown} n */
function fmtGapPercentPt(n) {
  if (n == null || typeof n !== "number" || Number.isNaN(n)) return "—";
  const usesRatio = Math.abs(n) <= 1 && !(n === 0);
  const value = usesRatio ? n * 100 : n;
  return `${fmtNumberPt(value, { decimals: 2 })}%`;
}

/** @param {unknown} iso */
function fmtDateTimePt(iso) {
  if (iso == null || iso === "") return "—";
  const s = String(iso);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(d);
}

/** @param {unknown} n */
function fmtNum(n) {
  return fmtNumberPt(n, { decimals: 2 });
}

/** @param {unknown} json */
function jsonPretty(json) {
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return String(json);
  }
}

/** @returns {workspace is { productId: string }} */
function isWorkspace(workspace) {
  return workspace != null && typeof workspace === "object" && typeof workspace.productId === "string";
}

/** @param {unknown} x */
function finiteNum(x) {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

/** @param {Record<string, unknown>} row */
function workspaceRatingNum(row) {
  const direct = finiteNum(row.ratingAverage);
  if (direct != null) return direct;
  const r = row.rating;
  if (typeof r === "number") return finiteNum(r);
  if (typeof r === "string") {
    const f = firstFloat(r);
    return Number.isFinite(f) ? f : null;
  }
  return null;
}

const creatorSignalsChipWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
  marginTop: "0.45rem",
  alignItems: "center"
};

const creatorSignalsChip = {
  fontSize: "0.72rem",
  lineHeight: 1.35,
  padding: "0.14rem 0.48rem",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)",
  color: "var(--tk-text-muted)",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

const operationalCardStyle = {
  ...box,
  borderColor: "rgb(56 68 77)",
  background: "linear-gradient(165deg, rgb(25 39 52) 0%, rgb(22 32 42) 100%)"
};

export default function ProductWorkspacePage() {
  const { productId: paramId } = useParams();

  /** @type {WorkspacePayload | null} */
  const [workspace, setWorkspace] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);

  const [importFlash, setImportFlash] = useState(/** @type {{ kind: "ok" | "err", text: string } | null} */ (null));
  const [importBusy, setImportBusy] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState(/** @type {{ kind: "ok" | "err", text: string } | null} */ (null));
  const [localExportBusy, setLocalExportBusy] = useState(false);
  const [localExportMsg, setLocalExportMsg] = useState(
    /** @type {{ kind: "ok" | "err", text: string } | null} */ (null)
  );

  const [selectedUrls, setSelectedUrls] = useState(() => new Set());
  const [selectedMainImageUrl, setSelectedMainImageUrl] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState(/** @type {{ kind: "ok" | "err", text: string } | null} */ (null));

  const decodedId =
    typeof paramId === "string" && paramId.trim() !== "" ? decodeURIComponent(paramId.trim()) : "";

  /** @type {import("./productStatusStorage.js").ProductStatusKey} */
  const [pipelineKey, setPipelineKey] = useState(
    /** @type {import("./productStatusStorage.js").ProductStatusKey} */ (PRODUCT_STATUS_DEFAULT)
  );

  const pipelineMeta = useMemo(() => productStatusMeta(pipelineKey), [pipelineKey]);

  useEffect(() => {
    if (!decodedId) {
      setPipelineKey(PRODUCT_STATUS_DEFAULT);
      return undefined;
    }
    const sync = () => {
      setPipelineKey(getProductStatusForProduct(decodedId));
    };
    sync();
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
      if (e.key === PRODUCT_STATUS_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [decodedId]);

  const onPipelineSelect = useCallback(
    /** @param {import("react").ChangeEvent<HTMLSelectElement>} e */
    (e) => {
      if (!decodedId) return;
      const v = e.target.value;
      setProductStatus(decodedId, v);
      setPipelineKey(normalizeProductStatusKey(v));
    },
    [decodedId]
  );

  const [shortlisted, setShortlisted] = useState(false);

  useEffect(() => {
    if (!decodedId) {
      setShortlisted(false);
      return undefined;
    }
    const sync = () => {
      setShortlisted(isProductInShortlist(decodedId));
    };
    sync();
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
      if (e.key === CREATOR_SHORTLIST_STORAGE_KEY || e.key === null) sync();
    };
    const onShortlistSameTab = () => {
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CREATOR_SHORTLIST_CHANGED_EVENT, onShortlistSameTab);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CREATOR_SHORTLIST_CHANGED_EVENT, onShortlistSameTab);
    };
  }, [decodedId]);

  const onToggleShortlist = useCallback(() => {
    if (!decodedId || !isWorkspace(workspace)) return;
    const nome = typeof workspace.nome === "string" ? workspace.nome.trim() : "";
    const { inList } = toggleCreatorShortlist({ productId: decodedId, nome: nome || "—" });
    setShortlisted(inList);
  }, [decodedId, workspace]);

  const onExportImagesToSpaces = useCallback(async () => {
    if (!decodedId) return;
    setExportBusy(true);
    setExportMsg({ kind: "ok", text: "Exportação iniciada" });
    try {
      const res = await apiPost("/analytics/images-upload", { productId: decodedId });
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

      setProductStatus(decodedId, "conteudo_produzido");
      setExportMsg({
        kind: "ok",
        text: `Exportação concluída${bits.length ? " · " + bits.join(" · ") : ""}`
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportMsg({ kind: "err", text: `Falha ao exportar: ${msg}` });
    } finally {
      setExportBusy(false);
    }
  }, [decodedId]);

  const onExportLocal = useCallback(async () => {
    if (!decodedId) return;
    if (!isWorkspace(workspace) || !Array.isArray(workspace.imageUrls) || workspace.imageUrls.length === 0) {
      setLocalExportMsg({ kind: "err", text: "Este produto não tem imagens no snapshot para exportar." });
      return;
    }
    if (!selectedMainImageUrl || !workspace.imageUrls.includes(selectedMainImageUrl)) {
      setLocalExportMsg({ kind: "err", text: "Selecione uma imagem principal antes de exportar local." });
      return;
    }
    setLocalExportBusy(true);
    setLocalExportMsg({ kind: "ok", text: "Exportação local iniciada" });
    try {
      const res = await apiPost("/analytics/export-local", { productId: decodedId, selectedImageUrl: selectedMainImageUrl });
      const dir = res && typeof res === "object" && typeof res.dir === "string" ? res.dir.trim() : "";
      const saved = res && typeof res === "object" && Number.isFinite(Number(res.imagesSaved)) ? Number(res.imagesSaved) : null;
      const failed = res && typeof res === "object" && Number.isFinite(Number(res.imagesFailed)) ? Number(res.imagesFailed) : null;
      const bits = [];
      if (saved != null) bits.push(`imagens: ${saved.toLocaleString("pt-BR")}`);
      if (failed != null) bits.push(`falhas: ${failed.toLocaleString("pt-BR")}`);
      setLocalExportMsg({
        kind: "ok",
        text: `Exportação local concluída${bits.length ? " · " + bits.join(" · ") : ""}${dir ? ` · ${dir}` : ""}`
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalExportMsg({ kind: "err", text: `Falha ao exportar local: ${msg}` });
    } finally {
      setLocalExportBusy(false);
    }
  }, [decodedId, selectedMainImageUrl, workspace]);

  const exportDone =
    exportMsg?.kind === "ok" && typeof exportMsg.text === "string" && exportMsg.text.startsWith("Exportação concluída");
  const localExportDone =
    localExportMsg?.kind === "ok" &&
    typeof localExportMsg.text === "string" &&
    localExportMsg.text.startsWith("Exportação local concluída");

  const briefing = useMemo(
    () => (isWorkspace(workspace) ? buildProductBriefingFromWorkspace(/** @type {WorkspacePayload & Record<string, unknown>} */ (workspace)) : null),
    [workspace]
  );

  /** Sinais comerciais rápidos: só heurísticas já usadas noutras vistas (labels + ticket + thresholds mínimos). */
  const creatorSignals = useMemo(() => {
    if (!isWorkspace(workspace)) return [];
    const w = /** @type {Record<string, unknown>} */ ({ ...workspace });
    const dv = w.deltaVendas;
    if (w.deltaNumeric == null && dv != null && dv !== "—") {
      const p = typeof dv === "string" ? parseDelta(String(dv)) : finiteNum(dv);
      if (p != null && !Number.isNaN(p)) w.deltaNumeric = p;
    }

    /** @type {{ id: string, emoji: string, label: string }[]} */
    const chips = [...deriveProductLabels(w)];

    const ticket = getTicketLabel(w);
    const hasDeriveTicketAlto = chips.some((c) => c.id === "ticket_alto");
    if (ticket.tier && !hasDeriveTicketAlto) {
      chips.push({
        id: "creator_ticket_tier",
        emoji: "💳",
        label: `Ticket ${ticket.shortLabel}`
      });
    }

    const sc = finiteNum(w.score);
    if (sc != null && sc >= 70) {
      chips.push({ id: "score_forte", emoji: "⭐", label: "Score forte" });
    }

    const rv = workspaceRatingNum(w);
    if (rv != null && rv >= 4.5) {
      chips.push({ id: "rating_alto", emoji: "🏅", label: "Rating alto" });
    }

    const sv = finiteNum(w.vendas);
    if (sv != null && sv > 0 && sv <= 300) {
      chips.push({ id: "poucas_vendas", emoji: "📉", label: "Poucas vendas" });
    }

    return chips;
  }, [workspace]);

  const reloadWorkspace = useCallback(async () => {
    if (!decodedId) {
      setWorkspace(null);
      setLoadError("ID do produto em falta no URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const path = `/analytics/product-workspace/${encodeURIComponent(decodedId)}`;
      const json = await apiFetch(path);
      setWorkspace(json);
      if ("message" in json && json.message && typeof json.productId !== "string") {
        setLoadError(String(json.message));
      } else {
        setLoadError(null);
      }
    } catch (e) {
      setWorkspace(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [decodedId]);

  useEffect(() => {
    void reloadWorkspace();
  }, [reloadWorkspace]);

  const onImportJsonToDb = useCallback(async () => {
    setImportFlash(null);
    setImportBusy(true);
    try {
      await apiPost("/analytics/import-output", {});
      setImportFlash({
        kind: "ok",
        text: "JSON importado para a BD. A lista de imagens foi actualizada conforme o snapshot mais recente."
      });
      setSelectedUrls(new Set());
      setZipMsg(null);
      await reloadWorkspace();
    } catch (e) {
      setImportFlash({
        kind: "err",
        text: e instanceof Error ? e.message : String(e)
      });
    } finally {
      setImportBusy(false);
    }
  }, [reloadWorkspace]);

  useEffect(() => {
    if (loading || !isWorkspace(workspace)) return;
    pushRecentWorkspace({
      productId: workspace.productId,
      nome: typeof workspace.nome === "string" ? workspace.nome : "—"
    });
  }, [loading, workspace]);

  useEffect(() => {
    setSelectedUrls(new Set());
    setZipMsg(null);
  }, [decodedId]);

  useEffect(() => {
    if (!decodedId) {
      setNotes("");
      setNotesLoaded(true);
      return undefined;
    }
    try {
      const raw = localStorage.getItem(notesStorageKey(decodedId));
      setNotes(raw ?? "");
    } catch {
      setNotes("");
    }
    setNotesLoaded(true);
    return undefined;
  }, [decodedId]);

  const persistNotes = useCallback(
    (value) => {
      if (!decodedId) return;
      const trimmed = value.length > NOTES_MAX ? value.slice(0, NOTES_MAX) : value;
      try {
        localStorage.setItem(notesStorageKey(decodedId), trimmed);
      } catch {
        /* ignore quota */
      }
    },
    [decodedId]
  );

  const onNotesChange = (e) => {
    const v = e.target.value;
    const next = v.length > NOTES_MAX ? v.slice(0, NOTES_MAX) : v;
    setNotes(next);
    persistNotes(next);
  };

  const toggleImageUrl = useCallback((url) => {
    setSelectedUrls((prev) => {
      const n = new Set(prev);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  }, []);

  const selectAllImages = useCallback(() => {
    if (!isWorkspace(workspace) || !Array.isArray(workspace.imageUrls)) return;
    setSelectedUrls(new Set(workspace.imageUrls));
  }, [workspace]);

  const clearImageSelection = useCallback(() => {
    setSelectedUrls(new Set());
  }, []);

  const downloadImagesZip = useCallback(
    async (mode) => {
      if (!isWorkspace(workspace)) return;
      if (mode === "selected" && selectedUrls.size === 0) {
        setZipMsg({
          kind: "err",
          text: "Marca as fotos com a caixa ou usa «Baixar todas (ZIP)»."
        });
        return;
      }
      const path = `/analytics/product-workspace/${encodeURIComponent(workspace.productId)}/images-zip`;
      setZipBusy(true);
      setZipMsg(null);
      try {
        const body = mode === "all" ? {} : { urls: Array.from(selectedUrls) };
        const blob = await apiPostBlob(path, body);
        const fn = `produto-${workspace.productId}-fotos.zip`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = fn;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        setZipMsg({ kind: "ok", text: "ZIP descarregado (pasta habitual de downloads do browser)." });
      } catch (e) {
        setZipMsg({
          kind: "err",
          text: e instanceof Error ? e.message : String(e)
        });
      } finally {
        setZipBusy(false);
      }
    },
    [workspace, selectedUrls]
  );

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
      <p style={{ marginBottom: "0.65rem", fontSize: "0.8rem" }}>
        <Link to="/" style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}>
          ← Voltar ao painel
        </Link>
      </p>

      {loading && <p style={{ opacity: 0.85 }}>Carregando produto…</p>}
      {!loading && loadError && !isWorkspace(workspace) ? (
        <p style={{ color: "#f97373" }}>{loadError}</p>
      ) : null}
      {!loading && workspace && typeof workspace.productId !== "string" && workspace.message ? (
        <p style={{ opacity: 0.9 }}>{workspace.message}</p>
      ) : null}

      {!loading && isWorkspace(workspace) ? (
        <>
          <header style={{ marginBottom: "1rem", paddingBottom: "0.85rem", borderBottom: "1px solid #273440" }}>
            <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 0.35rem", lineHeight: 1.35 }}>
              {workspace.nome}
            </h1>
            <p style={{ fontSize: "0.82rem", opacity: 0.9, margin: "0 0 0.65rem" }}>
              <strong>Loja:</strong> {workspace.loja} · <strong>Score:</strong> {workspace.score}{" "}
              <span style={{ opacity: 0.82 }}>({workspace.classific})</span>
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(auto, max-content) 1fr auto",
                gap: "0.35rem 0.65rem",
                alignItems: "center",
                fontSize: "0.71rem",
                fontFamily: "ui-monospace, monospace",
                maxWidth: "100%"
              }}
            >
              <span style={{ opacity: 0.65, justifySelf: "start" }}>productId</span>
              <span style={{ wordBreak: "break-all", justifySelf: "start" }}>{workspace.productId}</span>
              <button type="button" style={copyBtnMini} onClick={() => void navigator.clipboard?.writeText(workspace.productId).catch(() => {})}>
                Copiar
              </button>
              {workspace.sellerId ? (
                <>
                  <span style={{ opacity: 0.65 }}>sellerId</span>
                  <span style={{ wordBreak: "break-all" }}>{workspace.sellerId}</span>
                  <button type="button" style={copyBtnMini} onClick={() => void navigator.clipboard?.writeText(workspace.sellerId).catch(() => {})}>
                    Copiar
                  </button>
                </>
              ) : null}
            </div>
            {workspace.sourcePlatform ? (
              <p style={{ fontSize: "0.7rem", opacity: 0.7, margin: "0.5rem 0 0" }}>
                Plataforma: <strong>{workspace.sourcePlatform}</strong>
              </p>
            ) : null}
          </header>

          <div style={{ marginBottom: "0.65rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => {
                onToggleShortlist();
              }}
              aria-pressed={shortlisted}
              style={{
                padding: "0.35rem 0.65rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: 8,
                border: shortlisted ? "1px solid #b8860b" : "1px solid #45515c",
                background: shortlisted ? "rgb(55 40 10 / 0.85)" : "#1a2630",
                color: shortlisted ? "#fde68a" : "#e7e9ea"
              }}
            >
              {shortlisted ? "★ Remover dos favoritos" : "⭐ Favoritar"}
            </button>
            <span style={{ fontSize: "0.68rem", opacity: 0.65, maxWidth: "20rem", lineHeight: 1.35 }}>Shortlist e pipeline sincronizam com «Produtos em análise».</span>
          </div>

          <section style={operationalCardStyle}>
            <h2
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                margin: "0 0 0.35rem",
                letterSpacing: "0.02em",
                color: "#dbe8f4"
              }}
            >
              🎯 Pipeline do Produto
            </h2>
            <p style={{ margin: "0 0 0.55rem", fontSize: "0.74rem", lineHeight: 1.5, opacity: 0.88, color: "var(--tk-text)" }}>
              Onde está o produto no fluxo creator.
            </p>
            <p style={{ margin: "-0.25rem 0 0.55rem", fontSize: "0.72rem", lineHeight: 1.45, opacity: 0.65 }}>
              Dados salvos apenas neste navegador.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: pipelineMeta ? "0.45rem" : 0
              }}
            >
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.55rem",
                  borderRadius: 6,
                  border: "1px solid var(--tk-border)",
                  background: "var(--tk-surface-inset)",
                  color: "var(--tk-text)",
                  whiteSpace: "nowrap"
                }}
              >
                {badgeTextForProductStatus(pipelineKey)}
              </span>
              <label htmlFor="tk-workspace-pipeline" style={{ fontSize: "0.7rem", opacity: 0.75 }}>
                Estágio:
              </label>
              <select
                id="tk-workspace-pipeline"
                value={pipelineKey}
                onChange={onPipelineSelect}
                aria-label="Estágio do pipeline do produto"
                style={{
                  flex: "1 1 12rem",
                  minWidth: "10rem",
                  maxWidth: "100%",
                  fontSize: "0.78rem",
                  padding: "0.32rem 0.45rem",
                  borderRadius: 6,
                  border: "1px solid #45515c",
                  background: "#1a2630",
                  color: "#e7e9ea",
                  cursor: "pointer"
                }}
              >
                {PRODUCT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.emoji} {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {pipelineMeta ? (
              <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.5, opacity: 0.82, color: "#9eb5c9" }}>{pipelineMeta.hint}</p>
            ) : null}
          </section>

          <section style={operationalCardStyle}>
            <h2
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                margin: "0 0 0.35rem",
                letterSpacing: "0.02em",
                color: "#dbe8f4"
              }}
            >
              🎯 Creator Signals
            </h2>
            <p style={{ margin: "0 0 0.55rem", fontSize: "0.74rem", lineHeight: 1.5, opacity: 0.88, color: "var(--tk-text)" }}>
              Leitura rápida a partir dos mesmos números do painel — não altera score nem API.
            </p>
            {creatorSignals.length > 0 ? (
              <div style={creatorSignalsChipWrap} aria-label="Sinais comerciais derivados dos dados do produto">
                {creatorSignals.map((s) => (
                  <span key={s.id} style={creatorSignalsChip} title={`${s.emoji} ${s.label}`}>
                    <span aria-hidden>{s.emoji}</span>
                    &nbsp;{s.label}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "0.76rem", opacity: 0.72 }}>Nenhum sinal automático para destacar — os números no resumo acima já ajudam.</p>
            )}
          </section>

          {briefing ? (
            <section style={box}>
              <Subsection title="Briefing · Resumo do produto">
                <p style={{ margin: 0, fontSize: "0.81rem", lineHeight: 1.58, opacity: 0.94 }}>
                  {briefing.resumo}
                </p>
                {briefing.scoreSentence ? (
                  <p
                    style={{
                      margin: "0.65rem 0 0",
                      fontSize: "0.79rem",
                      fontWeight: 600,
                      lineHeight: 1.5,
                      color: "#8ecdfa"
                    }}
                  >
                    {briefing.scoreSentence}
                  </p>
                ) : null}
              </Subsection>

              <hr style={divider} />

              <Subsection title="Motivos positivos">
                {briefing.positivos.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.05rem", fontSize: "0.78rem", lineHeight: 1.55, opacity: 0.9 }}>
                    {briefing.positivos.map((t, i) => (
                      <li key={i} style={{ marginBottom: "0.35rem" }}>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.76rem", opacity: 0.68 }}>Nenhum critério automático destacou motivos fortes — veja os números abaixo.</p>
                )}
              </Subsection>

              <hr style={divider} />

              <Subsection title="Riscos">
                {briefing.riscos.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.05rem", fontSize: "0.78rem", lineHeight: 1.55, opacity: 0.9 }}>
                    {briefing.riscos.map((t, i) => (
                      <li key={i} style={{ marginBottom: "0.35rem" }}>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.76rem", opacity: 0.68 }}>Nenhum risco automático destacado — continua a validar manualmente.</p>
                )}
              </Subsection>
            </section>
          ) : null}

          <section style={box}>
            <Subsection title="Resumo (última importação)">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
                  gap: "0.55rem"
                }}
              >
                <div>
                  <div style={labelMuted}>Preço{workspace.currency ? ` (${workspace.currency})` : ""}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 500 }}>{workspace.preco !== "" ? workspace.preco : "—"}</div>
                </div>
                <div>
                  <div style={labelMuted}>Vendas</div>
                  <div style={{ fontSize: "1rem", fontWeight: 500 }}>{workspace.vendas !== "" ? workspace.vendas : "—"}</div>
                </div>
                <div>
                  <div style={labelMuted}>Rating</div>
                  <div style={{ fontSize: "0.95rem" }}>{workspace.rating || "—"}</div>
                </div>
                <div>
                  <div style={labelMuted}>Δ vendas</div>
                  <div style={{ fontSize: "0.95rem" }}>{workspace.deltaVendas ?? "—"}</div>
                </div>
              </div>
              {workspace.deltaHint ? (
                <div
                  style={{
                    margin: "0.55rem 0 0",
                    padding: "0.45rem 0.55rem",
                    background: "rgba(14, 165, 233, 0.07)",
                    borderRadius: 6,
                    border: "1px solid rgba(56, 189, 248, 0.2)"
                  }}
                >
                  <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.03em", opacity: 0.88, color: "#7dd3fc", marginBottom: "0.28rem" }}>
                    Contexto dos dados (API)
                  </div>
                  <p style={{ margin: 0, fontSize: "0.71rem", opacity: 0.82, color: "#b8d4e8", lineHeight: 1.48 }}>{workspace.deltaHint}</p>
                </div>
              ) : null}
            </Subsection>

            <hr style={divider} />

            <Subsection title="Pastas Space e categoria">
              {workspace.exportPrefix ? (
                <div style={{ marginBottom: workspace.categorySlug || workspace.categoryUrl ? "0.55rem" : 0 }}>
                  <div style={{ ...labelMuted, marginBottom: "0.2rem" }}>Prefixo no bucket (onde cai o export)</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "0.45rem 0.55rem",
                      borderRadius: 6,
                      background: "#0f171e",
                      border: "1px solid #2a3540",
                      fontSize: "0.65rem",
                      lineHeight: 1.42,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      maxHeight: "5rem",
                      overflow: "auto"
                    }}
                  >
                    {workspace.exportPrefix}
                  </pre>
                  <button
                    type="button"
                    style={{ ...copyBtnMini, marginLeft: 0, marginTop: "0.35rem" }}
                    onClick={() => void navigator.clipboard?.writeText(workspace.exportPrefix).catch(() => {})}
                  >
                    Copiar prefixo
                  </button>
                </div>
              ) : null}
              {workspace.categorySlug ? (
                <p style={{ fontSize: "0.79rem", margin: "0 0 0.35rem", lineHeight: 1.45 }}>
                  <span style={{ opacity: 0.7 }}>Slug:&nbsp;</span>
                  <code style={{ fontSize: "0.76rem", opacity: 0.92 }}>{workspace.categorySlug}</code>
                </p>
              ) : null}
              {workspace.categoryUrl ? (
                <details style={{ fontSize: "0.74rem", opacity: 0.85 }}>
                  <summary style={{ cursor: "pointer", userSelect: "none" }}>
                    Ver URL da categoria (longa)
                  </summary>
                  <p style={{ margin: "0.4rem 0 0", wordBreak: "break-all", lineHeight: 1.45, opacity: 0.8 }}>
                    {workspace.categoryUrl}
                  </p>
                </details>
              ) : null}
            </Subsection>

            {(workspace.originalPrice != null ||
              workspace.hasDiscount ||
              workspace.estimatedShowcasePrice != null ||
              workspace.estimatedPriceGap != null ||
              workspace.estimatedPriceGapPercent != null ||
              workspace.salesText) ? (
              <>
                <hr style={divider} />
                <Subsection title="Preços e texto de vendas (coleta)">
                  {(workspace.originalPrice != null ||
                    workspace.hasDiscount ||
                    workspace.estimatedShowcasePrice != null ||
                    workspace.estimatedPriceGap != null ||
                    workspace.estimatedPriceGapPercent != null) ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
                        gap: "0.45rem",
                        marginBottom: workspace.salesText ? "0.55rem" : 0
                      }}
                    >
                      <div>
                        <div style={labelMuted}>Preço original</div>
                        <div style={{ fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" }}>
                          {fmtNumberPt(workspace.originalPrice, { decimals: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={labelMuted}>Desconto</div>
                        <div style={{ fontSize: "0.86rem" }}>{workspace.hasDiscount ? "Sim" : "Não"}</div>
                      </div>
                      <div>
                        <div style={labelMuted}>Showcase estimado</div>
                        <div style={{ fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" }}>
                          {fmtNum(workspace.estimatedShowcasePrice)}
                        </div>
                      </div>
                      <div>
                        <div style={labelMuted}>Gap preço (est.)</div>
                        <div style={{ fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" }}>
                          {fmtNumberPt(workspace.estimatedPriceGap, { decimals: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={labelMuted}>Gap % (est.)</div>
                        <div style={{ fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" }}>
                          {fmtGapPercentPt(workspace.estimatedPriceGapPercent)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {workspace.salesText ? (
                    <div>
                      <div style={labelMuted}>Texto de vendas · bruto</div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.79rem",
                          lineHeight: 1.52,
                          padding: "0.45rem 0.55rem",
                          borderRadius: 6,
                          background: "#141d27",
                          border: "1px solid #2a3540",
                          opacity: 0.92
                        }}
                      >
                        {workspace.salesText}
                      </p>
                    </div>
                  ) : null}
                </Subsection>
              </>
            ) : null}

            {(workspace.ratingAverage != null ||
              workspace.ratingTotal != null ||
              workspace.snapshotCapturedAt ||
              workspace.firstSeenAt ||
              workspace.lastSeenAt ||
              workspace.votesByStar != null ||
              workspace.dataQuality != null ||
              workspace.sellerGlobalId) ? (
              <>
                <hr style={divider} />
                <Subsection title="Snapshot · datas · JSON opcional">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                      fontSize: "0.82rem"
                    }}
                  >
                    <div>
                      <div style={labelMuted}>Média (nº)</div>
                      {fmtNumberPt(workspace.ratingAverage, { decimals: 2 })}
                    </div>
                    <div>
                      <div style={labelMuted}>Total de aval.</div>
                      {workspace.ratingTotal != null ? String(workspace.ratingTotal) : "—"}
                    </div>
                    <div>
                      <div style={labelMuted}>Este snapshot foi captado em</div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDateTimePt(workspace.snapshotCapturedAt)}</span>
                    </div>
                    <div>
                      <div style={labelMuted}>1.ª vez que vi este produto</div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDateTimePt(workspace.firstSeenAt)}</span>
                    </div>
                    <div>
                      <div style={labelMuted}>Último registo do produto</div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDateTimePt(workspace.lastSeenAt)}</span>
                    </div>
                  </div>
                  {workspace.sellerGlobalId ? (
                    <p style={{ fontSize: "0.69rem", opacity: 0.72, margin: "0 0 0.45rem", fontFamily: "ui-monospace, monospace" }}>
                      globalSellerId: {workspace.sellerGlobalId}
                    </p>
                  ) : null}
                  {workspace.votesByStar != null ? (
                    <details style={{ fontSize: "0.74rem", marginBottom: workspace.dataQuality != null ? "0.4rem" : 0 }}>
                      <summary style={{ cursor: "pointer", opacity: 0.85 }}>Votos por estrela (JSON)</summary>
                      <pre
                        style={{
                          marginTop: "0.35rem",
                          padding: "0.5rem",
                          overflow: "auto",
                          maxHeight: "220px",
                          background: "#0f171e",
                          borderRadius: 6,
                          fontSize: "0.67rem",
                          border: "1px solid #2a3540"
                        }}
                      >
                        {jsonPretty(workspace.votesByStar)}
                      </pre>
                    </details>
                  ) : null}
                  {workspace.dataQuality != null ? (
                    <details style={{ fontSize: "0.74rem" }}>
                      <summary style={{ cursor: "pointer", opacity: 0.85 }}>Qualidade dos dados · JSON interno</summary>
                      <pre
                        style={{
                          marginTop: "0.35rem",
                          padding: "0.5rem",
                          overflow: "auto",
                          maxHeight: "220px",
                          background: "#0f171e",
                          borderRadius: 6,
                          fontSize: "0.67rem",
                          border: "1px solid #2a3540"
                        }}
                      >
                        {jsonPretty(workspace.dataQuality)}
                      </pre>
                    </details>
                  ) : null}
                </Subsection>
              </>
            ) : null}
          </section>

          {workspace.motivos ? (
            <section style={{ ...box }}>
              <div style={subsectionTitle}>Porque este score?</div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.84rem", lineHeight: 1.52, opacity: 0.92 }}>
                {workspace.motivos}
              </p>
            </section>
          ) : null}

          <section style={{ ...box }}>
            <div style={{ ...labelMuted, marginBottom: "0.55rem" }}>Ligações</div>
            <p style={{ margin: "0 0 0.55rem", fontSize: "0.69rem", lineHeight: 1.45, opacity: 0.78, maxWidth: "52rem" }}>
              As fotos mais abaixo vêm da <strong>última importação na BD</strong> (<code>pdpImages</code> no snapshot).{" "}
              <strong>Enriquecer PDP</strong> dispara no servidor o script que escreve galeria PDP no <code>dados_produtos.json</code> consolidado
              (pode demorar ~1 min.). <strong>Actualizar dados — import JSON→BD</strong> corre o mesmo import que na raiz (<code>npm run db:import:output</code>): lê o JSON e grava no Postgres — é o passo necessário para as novas fotos aparecerem aqui.{" "}
              <strong>Refrescar da BD</strong> só volta a pedir à API os dados deste produto <em>sem</em> importar nada (útil se já importaste no terminal ou doutro separador, ou para rever o snapshot actual sem repetir o import).
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "flex-start" }}>
              <PdpEnrichButton productId={decodedId} />
              <button
                type="button"
                disabled={importBusy || loading || !decodedId}
                onClick={() => void onImportJsonToDb()}
                title="Corre no servidor npm run db:import:output e recarrega este painel"
                style={{
                  padding: "0.28rem 0.55rem",
                  fontSize: "0.68rem",
                  cursor: importBusy ? "wait" : "pointer",
                  borderRadius: 5,
                  border: "1px solid #2d6aa3",
                  background: "#1a4a73",
                  color: "#e8f3ff",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  alignSelf: "center"
                }}
              >
                {importBusy ? "A importar…" : "Actualizar dados — import JSON→BD"}
              </button>
              <button
                type="button"
                disabled={exportBusy || localExportBusy || loading || !decodedId}
                onClick={() => void onExportImagesToSpaces()}
                title="Exporta imagens deste produto para o DigitalOcean Spaces (não faz scraping)"
                aria-busy={exportBusy}
                style={{
                  padding: "0.28rem 0.55rem",
                  fontSize: "0.68rem",
                  cursor: exportBusy ? "wait" : "pointer",
                  borderRadius: 6,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  border: exportDone ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid #567138",
                  background: exportDone ? "rgba(34, 197, 94, 0.12)" : "#203014",
                  color: "#dcedc8",
                  opacity: exportBusy ? 0.7 : 1,
                  alignSelf: "center"
                }}
              >
                {exportBusy ? "Exportando…" : exportDone ? "Exportar ✓" : "Exportar"}
              </button>
              <button
                type="button"
                disabled={localExportBusy || exportBusy || importBusy || loading || !decodedId || !selectedMainImageUrl}
                onClick={() => void onExportLocal()}
                title="Exporta um kit local do produto no Windows (não faz scraping)"
                aria-busy={localExportBusy}
                style={{
                  padding: "0.28rem 0.55rem",
                  fontSize: "0.68rem",
                  cursor: localExportBusy ? "wait" : "pointer",
                  borderRadius: 6,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  border: localExportDone ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid #45515c",
                  background: localExportDone ? "rgba(34, 197, 94, 0.12)" : "#1a2733",
                  color: localExportDone ? "#dcedc8" : "#e7e9ea",
                  opacity: localExportBusy ? 0.7 : 1,
                  alignSelf: "center"
                }}
              >
                {localExportBusy ? "Exportando local…" : localExportDone ? "Exportar local ✓" : "Exportar local"}
              </button>
              <span style={{ fontSize: "0.7rem", opacity: 0.75, alignSelf: "center" }}>
                {selectedMainImageUrl ? "Imagem principal selecionada ✓" : "Selecione uma imagem principal antes de exportar local."}
              </span>
              <button
                type="button"
                disabled={loading || !decodedId}
                onClick={() => void reloadWorkspace()}
                title="Volta a carregar só esta página a partir da API (GET workspace). Não executa import do JSON — não substitui «Actualizar dados»."
                aria-label="Refrescar da base de dados sem importar o ficheiro JSON"
                style={{
                  padding: "0.28rem 0.55rem",
                  fontSize: "0.68rem",
                  cursor: loading ? "wait" : "pointer",
                  borderRadius: 5,
                  border: "1px solid #45515c",
                  background: "#22303c",
                  color: "#e7e9ea",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  alignSelf: "center"
                }}
              >
                Refrescar da BD
              </button>
              {workspace.link ? (
                <a
                  href={workspace.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tk-btn-neutral"
                  style={{
                    padding: "0.28rem 0.55rem",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    borderRadius: 6,
                    alignSelf: "center",
                    textAlign: "center",
                    whiteSpace: "nowrap"
                  }}
                >
                  Abrir no TikTok
                </a>
              ) : (
                <span style={{ opacity: 0.65, alignSelf: "center" }}>Sem URL do produto.</span>
              )}
            </div>
            {importFlash ? (
              <p
                role="status"
                style={{
                  marginTop: "0.55rem",
                  marginBottom: 0,
                  fontSize: "0.71rem",
                  color: importFlash.kind === "ok" ? "#9ed9b0" : "#f97373",
                  lineHeight: 1.45
                }}
              >
                {importFlash.text}
              </p>
            ) : null}
            {exportMsg ? (
              <p
                role="status"
                style={{
                  marginTop: "0.35rem",
                  marginBottom: 0,
                  fontSize: "0.71rem",
                  color: exportMsg.kind === "ok" ? "#9ed9b0" : "#f97373",
                  lineHeight: 1.45
                }}
              >
                {exportMsg.text}
              </p>
            ) : null}
            {localExportMsg ? (
              <p
                role="status"
                style={{
                  marginTop: "0.35rem",
                  marginBottom: 0,
                  fontSize: "0.71rem",
                  color: localExportMsg.kind === "ok" ? "#9ed9b0" : "#f97373",
                  lineHeight: 1.45
                }}
              >
                {localExportMsg.text}
              </p>
            ) : null}
            {workspace.scrapeRun ? (
              <p style={{ fontSize: "0.68rem", opacity: 0.65, marginTop: "0.55rem", marginBottom: 0 }}>
                Dados do ScrapeRun <code>{workspace.scrapeRun.id.slice(0, 10)}</code>
                … · {fmtDateTimePt(workspace.scrapeRun.collectedAt)}
              </p>
            ) : null}
          </section>

          {Array.isArray(workspace.imageUrls) && workspace.imageUrls.length > 0 ? (
            <section style={{ marginTop: "0.85rem" }}>
              <div style={{ ...labelMuted, marginBottom: "0.35rem" }}>Imagens no último snapshot</div>
              <p style={{ fontSize: "0.68rem", opacity: 0.72, margin: "0 0 0.5rem", lineHeight: 1.45 }}>
                Marca as que queres num ZIP, ou baixa todas já empacotadas pelo servidor (evita bloqueios CORS).
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  alignItems: "center",
                  marginBottom: "0.55rem"
                }}
              >
                <button
                  type="button"
                  disabled={zipBusy}
                  onClick={selectAllImages}
                  style={{
                    padding: "0.28rem 0.65rem",
                    fontSize: "0.7rem",
                    cursor: zipBusy ? "wait" : "pointer",
                    borderRadius: 6,
                    border: "1px solid #45515c",
                    background: "#22303c",
                    color: "#e7e9ea",
                    opacity: zipBusy ? 0.65 : 1
                  }}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  disabled={zipBusy}
                  onClick={clearImageSelection}
                  style={{
                    padding: "0.28rem 0.65rem",
                    fontSize: "0.7rem",
                    cursor: zipBusy ? "wait" : "pointer",
                    borderRadius: 6,
                    border: "1px solid #45515c",
                    background: "#1a2733",
                    color: "#c8d4e0",
                    opacity: zipBusy ? 0.65 : 1
                  }}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={zipBusy}
                  onClick={() => downloadImagesZip("all")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.72rem",
                    cursor: zipBusy ? "wait" : "pointer",
                    borderRadius: 6,
                    border: "1px solid #2978b8",
                    background: "#1d6fa5",
                    color: "#fff",
                    fontWeight: 600,
                    opacity: zipBusy ? 0.65 : 1
                  }}
                >
                  Baixar ZIP — todas ({workspace.imageUrls.length})
                </button>
                <button
                  type="button"
                  disabled={zipBusy || selectedUrls.size === 0}
                  onClick={() => downloadImagesZip("selected")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.72rem",
                    cursor: zipBusy || selectedUrls.size === 0 ? "not-allowed" : "pointer",
                    borderRadius: 6,
                    border: selectedUrls.size === 0 ? "1px solid #3a454d" : "1px solid #4a8699",
                    background: selectedUrls.size === 0 ? "#24303d" : "#2a6274",
                    color: "#e7f6fa",
                    fontWeight: 600,
                    opacity: zipBusy ? 0.65 : selectedUrls.size === 0 ? 0.55 : 1
                  }}
                >
                  Baixar ZIP — selecionadas ({selectedUrls.size})
                </button>
              </div>
              {zipMsg ? (
                <p
                  role="status"
                  style={{
                    fontSize: "0.7rem",
                    marginBottom: "0.5rem",
                    color: zipMsg.kind === "ok" ? "#9ed9b0" : "#f97373"
                  }}
                >
                  {zipMsg.text}
                </p>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
                  gap: "0.45rem"
                }}
              >
                {workspace.imageUrls.map((u, idx) => {
                  const checked = selectedUrls.has(u);
                  const isMain = selectedMainImageUrl === u;
                  return (
                    <div key={`${idx}-${u.slice(-32)}`} style={{ position: "relative", lineHeight: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleImageUrl(u)}
                        title="Incluir no ZIP «selecionadas»"
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          zIndex: 2,
                          width: "1rem",
                          height: "1rem",
                          cursor: zipBusy ? "wait" : "pointer",
                          accentColor: "#1d9bf0"
                        }}
                        disabled={zipBusy}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedMainImageUrl(u)}
                        disabled={zipBusy}
                        title={isMain ? "Imagem principal selecionada" : "Selecionar como imagem principal"}
                        style={{
                          position: "absolute",
                          bottom: 6,
                          left: 6,
                          zIndex: 2,
                          padding: "0.18rem 0.35rem",
                          fontSize: "0.62rem",
                          borderRadius: 6,
                          border: isMain ? "1px solid rgba(34, 197, 94, 0.65)" : "1px solid #45515c",
                          background: isMain ? "rgba(34, 197, 94, 0.16)" : "rgba(15, 23, 30, 0.85)",
                          color: isMain ? "#dcedc8" : "#e7e9ea",
                          cursor: zipBusy ? "wait" : "pointer"
                        }}
                      >
                        {isMain ? "Principal ✓" : "Selecionar principal"}
                      </button>
                      <a href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                        <img
                          src={u}
                          alt=""
                          loading="lazy"
                          style={{
                            width: "100%",
                            aspectRatio: "1",
                            objectFit: "cover",
                            borderRadius: 6,
                            border: isMain ? "2px solid rgba(34, 197, 94, 0.85)" : checked ? "2px solid #1d9bf0" : "1px solid #334",
                            boxSizing: "border-box"
                          }}
                        />
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p style={{ fontSize: "0.75rem", opacity: 0.65, lineHeight: 1.5 }}>
              Sem imagens neste snapshot. Se já enriqueceu o PDP no JSON mas ainda só vê uma foto, rode «Actualizar dados — import
              JSON→BD» em Ligações (ou espere ~1 min. após Enriquecer PDP e depois importe).
            </p>
          )}

          <section style={{ ...box, marginTop: "1rem" }}>
            <div style={{ ...labelMuted, marginBottom: "0.25rem", fontWeight: 600, opacity: 0.88, color: "#c4b8a8" }}>Minhas notas</div>
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.7rem", opacity: 0.68, lineHeight: 1.45 }}>
              Dados salvos apenas neste navegador.
              {!notesLoaded ? null : (
                <span style={{ opacity: 0.75, marginLeft: "0.35rem" }}>· máx. {NOTES_MAX.toLocaleString()} caracteres</span>
              )}
            </p>
            <textarea
              value={notes}
              readOnly={!notesLoaded}
              onChange={onNotesChange}
              placeholder="Decisões, preço-alvo, fornecedor, próximos passos…"
              rows={10}
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: "0.82rem",
                fontFamily: "inherit",
                lineHeight: 1.45,
                padding: "0.55rem 0.65rem",
                borderRadius: 6,
                border: "1px solid #45515c",
                background: "#0f171e",
                color: "#e7e9ea",
                resize: "vertical",
                minHeight: "140px"
              }}
            />
          </section>

        </>
      ) : null}
      </div>
    </main>
  );
}
