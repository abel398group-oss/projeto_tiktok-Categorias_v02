import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, apiPost, apiPostBlob } from "./api.js";

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

export default function ProductWorkspacePage() {
  const { productId: paramId } = useParams();

  /** @type {WorkspacePayload | null} */
  const [workspace, setWorkspace] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(/** @type {{ kind: "ok" | "err", text: string } | null} */ (null));

  const [selectedUrls, setSelectedUrls] = useState(() => new Set());
  const [zipBusy, setZipBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState(/** @type {{ kind: "ok" | "err", text: string } | null} */ (null));

  const decodedId =
    typeof paramId === "string" && paramId.trim() !== "" ? decodeURIComponent(paramId.trim()) : "";

  useEffect(() => {
    if (!decodedId) {
      setWorkspace(null);
      setLoadError("ID do produto em falta no URL.");
      setLoading(false);
      return undefined;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const path = `/analytics/product-workspace/${encodeURIComponent(decodedId)}`;
        const json = await apiFetch(path);
        if (!cancel) {
          setWorkspace(json);
          if ("message" in json && json.message && typeof json.productId !== "string") {
            setLoadError(json.message);
          }
        }
      } catch (e) {
        if (!cancel) {
          setWorkspace(null);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [decodedId]);

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

  const onExport = async () => {
    if (!decodedId) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await apiPost("/analytics/export-product-to-spaces", { productId: decodedId });
      const prefix = typeof res?.prefix === "string" ? res.prefix : "";
      const up = typeof res?.imagesUploaded === "number" ? res.imagesUploaded : 0;
      const disc = typeof res?.imagesDiscovered === "number" ? res.imagesDiscovered : 0;
      const fail = typeof res?.imagesFailed === "number" ? res.imagesFailed : 0;
      setExportMsg({
        kind: "ok",
        text: `Exportado · ${prefix || "OK"} · imagens ${up}/${disc}${fail ? ` (${fail} falhas)` : ""}`
      });
    } catch (err) {
      setExportMsg({
        kind: "err",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setExporting(false);
    }
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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1rem 1.25rem", color: "#e7e9ea" }}>
      <p style={{ marginBottom: "0.65rem", fontSize: "0.8rem" }}>
        <Link to="/" style={{ color: "#6ec4ff", textDecoration: "none" }}>
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
                <p
                  style={{
                    fontSize: "0.71rem",
                    opacity: 0.78,
                    margin: "0.55rem 0 0",
                    lineHeight: 1.48,
                    padding: "0.45rem 0.55rem",
                    background: "rgba(255,190,92,0.07)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,190,92,0.15)"
                  }}
                >
                  {workspace.deltaHint}
                </p>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {workspace.link ? (
                <a href={workspace.link} target="_blank" rel="noopener noreferrer" style={{ color: "#6ec4ff" }}>
                  Abrir no TikTok
                </a>
              ) : (
                <span style={{ opacity: 0.65 }}>Sem URL do produto.</span>
              )}
              <button
                type="button"
                disabled={exporting}
                onClick={onExport}
                style={{
                  padding: "0.35rem 0.85rem",
                  fontSize: "0.76rem",
                  cursor: exporting ? "wait" : "pointer",
                  borderRadius: 6,
                  border: "1px solid #2978b8",
                  background: "#1d6fa5",
                  color: "#fff",
                  fontWeight: 600,
                  opacity: exporting ? 0.7 : 1
                }}
              >
                {exporting ? "Exportar…" : "Exportar ao Space"}
              </button>
            </div>
            {exportMsg ? (
              <p
                role="status"
                style={{
                  marginTop: "0.55rem",
                  marginBottom: 0,
                  fontSize: "0.72rem",
                  color: exportMsg.kind === "ok" ? "#9ed9b0" : "#f97373"
                }}
              >
                {exportMsg.text}
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
                            border: checked ? "2px solid #1d9bf0" : "1px solid #334",
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
            <p style={{ fontSize: "0.75rem", opacity: 0.65 }}>Sem imagens no snapshot (ou URLs vazias).</p>
          )}

          <section style={{ ...box, marginTop: "1rem" }}>
            <div style={{ ...labelMuted, marginBottom: "0.35rem" }}>
              Notas (gravadas só neste browser)
              {!notesLoaded ? null : (
                <span style={{ opacity: 0.6, marginLeft: "0.35rem" }}>
                  máx {NOTES_MAX.toLocaleString()} caracteres
                </span>
              )}
            </div>
            <textarea
              value={notes}
              readOnly={!notesLoaded}
              onChange={onNotesChange}
              placeholder="Lista de decisões, preço-alvo, fornecedor, próximos passos…"
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
  );
}
