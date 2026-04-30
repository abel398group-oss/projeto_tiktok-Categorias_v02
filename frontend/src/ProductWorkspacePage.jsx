import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";

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

/** @param {unknown} x */
function strOrDash(x) {
  if (x == null || x === "") return "—";
  return String(x);
}

/** @param {unknown} n */
function fmtNum(n) {
  if (n == null || typeof n !== "number" || Number.isNaN(n)) return "—";
  return String(n);
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
          <header style={{ marginBottom: "1rem" }}>
            <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 0.35rem", lineHeight: 1.35 }}>
              {workspace.nome}
            </h1>
            <p style={{ fontSize: "0.78rem", opacity: 0.85, margin: 0 }}>
              <strong>Loja:</strong> {workspace.loja} ·{" "}
              <strong>Score:</strong> {workspace.score} ({workspace.classific})
            </p>
            <p style={{ fontSize: "0.72rem", opacity: 0.75, margin: "0.35rem 0 0", fontFamily: "ui-monospace, monospace" }}>
              <strong>TikTok productId:</strong> {workspace.productId}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(workspace.productId).catch(() => {});
                }}
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "0.68rem",
                  padding: "0.12rem 0.4rem",
                  cursor: "pointer",
                  borderRadius: 4,
                  border: "1px solid #45515c",
                  background: "#22303c",
                  color: "#e7e9ea"
                }}
              >
                Copiar
              </button>
            </p>
            {workspace.sellerId ? (
              <p style={{ fontSize: "0.72rem", opacity: 0.72, margin: "0.25rem 0 0", fontFamily: "ui-monospace, monospace" }}>
                <strong>TikTok sellerId:</strong> {workspace.sellerId}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(workspace.sellerId).catch(() => {});
                  }}
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.68rem",
                    padding: "0.12rem 0.4rem",
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid #45515c",
                    background: "#22303c",
                    color: "#e7e9ea"
                  }}
                >
                  Copiar
                </button>
              </p>
            ) : null}
            {workspace.sourcePlatform ? (
              <p style={{ fontSize: "0.68rem", opacity: 0.65, margin: "0.35rem 0 0" }}>
                Plataforma: <strong>{workspace.sourcePlatform}</strong>
              </p>
            ) : null}
          </header>

          <section style={{ ...box, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.65rem" }}>
            <div>
              <div style={labelMuted}>Preço{workspace.currency ? ` (${workspace.currency})` : ""}</div>
              <div style={{ fontSize: "0.9rem" }}>{workspace.preco !== "" ? workspace.preco : "—"}</div>
            </div>
            <div>
              <div style={labelMuted}>Vendas</div>
              <div style={{ fontSize: "0.9rem" }}>{workspace.vendas !== "" ? workspace.vendas : "—"}</div>
            </div>
            <div>
              <div style={labelMuted}>Rating</div>
              <div style={{ fontSize: "0.9rem" }}>{workspace.rating || "—"}</div>
            </div>
            <div>
              <div style={labelMuted}>Δ vendas</div>
              <div style={{ fontSize: "0.9rem" }}>{workspace.deltaVendas ?? "—"}</div>
            </div>
          </section>
          {workspace.deltaHint ? (
            <p style={{ fontSize: "0.7rem", opacity: 0.72, marginTop: "-0.55rem", marginBottom: "0.85rem", lineHeight: 1.45 }}>
              {workspace.deltaHint}
            </p>
          ) : null}

          <section style={box}>
              <div style={{ ...labelMuted, marginBottom: "0.55rem" }}>Mais dados da base</div>
              {workspace.exportPrefix ? (
                <p style={{ fontSize: "0.72rem", margin: "0 0 0.5rem", lineHeight: 1.45 }}>
                  <strong style={{ display: "block", marginBottom: "0.2rem", opacity: 0.85 }}>Prefixo export Space</strong>
                  <code style={{ wordBreak: "break-all", fontSize: "0.68rem", opacity: 0.92 }}>
                    {workspace.exportPrefix}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(workspace.exportPrefix).catch(() => {});
                    }}
                    style={{
                      marginLeft: "0.45rem",
                      fontSize: "0.65rem",
                      padding: "0.08rem 0.35rem",
                      cursor: "pointer",
                      borderRadius: 4,
                      border: "1px solid #45515c",
                      background: "#22303c",
                      color: "#e7e9ea",
                      verticalAlign: "middle"
                    }}
                  >
                    Copiar
                  </button>
                </p>
              ) : null}
              {(workspace.categorySlug || workspace.categoryUrl) ? (
                <p style={{ fontSize: "0.72rem", margin: "0 0 0.5rem", opacity: 0.88 }}>
                  {workspace.categorySlug ? (
                    <>
                      <strong>Slug categoria:</strong> {workspace.categorySlug}
                      <br />
                    </>
                  ) : null}
                  {workspace.categoryUrl ? (
                    <span style={{ wordBreak: "break-all", opacity: 0.72 }}>{workspace.categoryUrl}</span>
                  ) : null}
                </p>
              ) : null}
              {(workspace.originalPrice != null ||
                workspace.hasDiscount ||
                workspace.estimatedShowcasePrice != null ||
                workspace.estimatedPriceGap != null ||
                workspace.estimatedPriceGapPercent != null) ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
                    gap: "0.5rem",
                    marginBottom: workspace.salesText ? "0.55rem" : 0
                  }}
                >
                  <div>
                    <div style={labelMuted}>Preço original</div>
                    <div style={{ fontSize: "0.82rem" }}>{fmtNum(workspace.originalPrice)}</div>
                  </div>
                  <div>
                    <div style={labelMuted}>Desconto?</div>
                    <div style={{ fontSize: "0.82rem" }}>{workspace.hasDiscount ? "sim" : "não"}</div>
                  </div>
                  <div>
                    <div style={labelMuted}>Showcase estim.</div>
                    <div style={{ fontSize: "0.82rem" }}>{fmtNum(workspace.estimatedShowcasePrice)}</div>
                  </div>
                  <div>
                    <div style={labelMuted}>Gap preço estim.</div>
                    <div style={{ fontSize: "0.82rem" }}>{fmtNum(workspace.estimatedPriceGap)}</div>
                  </div>
                  <div>
                    <div style={labelMuted}>Gap % estim.</div>
                    <div style={{ fontSize: "0.82rem" }}>{fmtNum(workspace.estimatedPriceGapPercent)}</div>
                  </div>
                </div>
              ) : null}
              {workspace.salesText ? (
                <div>
                  <div style={labelMuted}>Texto de vendas (bruto)</div>
                  <p style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.48, opacity: 0.9 }}>{workspace.salesText}</p>
                </div>
              ) : null}
            </section>

          {(workspace.ratingAverage != null ||
            workspace.ratingTotal != null ||
            workspace.votesByStar != null ||
            workspace.snapshotCapturedAt ||
            workspace.firstSeenAt ||
            workspace.lastSeenAt ||
            workspace.sellerGlobalId) ? (
            <section style={box}>
              <div style={{ ...labelMuted, marginBottom: "0.5rem" }}>Rating técnico · tempo</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
                  gap: "0.5rem",
                  marginBottom: "0.55rem",
                  fontSize: "0.82rem"
                }}
              >
                <div>
                  <div style={labelMuted}>Média (nº)</div>
                  {fmtNum(workspace.ratingAverage)}
                </div>
                <div>
                  <div style={labelMuted}>Total aval.</div>
                  {workspace.ratingTotal != null ? String(workspace.ratingTotal) : "—"}
                </div>
                <div>
                  <div style={labelMuted}>Captado em</div>
                  {strOrDash(workspace.snapshotCapturedAt)}
                </div>
                <div>
                  <div style={labelMuted}>1.ª vista / últ.</div>
                  <span style={{ fontSize: "0.74rem", lineHeight: 1.35 }}>
                    {strOrDash(workspace.firstSeenAt)}
                    <br />
                    {strOrDash(workspace.lastSeenAt)}
                  </span>
                </div>
              </div>
              {workspace.sellerGlobalId ? (
                <p style={{ fontSize: "0.7rem", opacity: 0.75, margin: "0 0 0.45rem", fontFamily: "ui-monospace, monospace" }}>
                  globalSellerId: {workspace.sellerGlobalId}
                </p>
              ) : null}
              {workspace.votesByStar != null ? (
                <details style={{ fontSize: "0.72rem", marginBottom: workspace.dataQuality != null ? "0.45rem" : 0 }}>
                  <summary style={{ cursor: "pointer", opacity: 0.88 }}>
                    votesByStar (JSON)
                  </summary>
                  <pre
                    style={{
                      marginTop: "0.4rem",
                      padding: "0.5rem",
                      overflow: "auto",
                      maxHeight: "220px",
                      background: "#0f171e",
                      borderRadius: 6,
                      fontSize: "0.68rem",
                      border: "1px solid #2a3540"
                    }}
                  >
                    {jsonPretty(workspace.votesByStar)}
                  </pre>
                </details>
              ) : null}
              {workspace.dataQuality != null ? (
                <details style={{ fontSize: "0.72rem" }}>
                  <summary style={{ cursor: "pointer", opacity: 0.88 }}>
                    dataQuality (JSON)
                  </summary>
                  <pre
                    style={{
                      marginTop: "0.4rem",
                      padding: "0.5rem",
                      overflow: "auto",
                      maxHeight: "220px",
                      background: "#0f171e",
                      borderRadius: 6,
                      fontSize: "0.68rem",
                      border: "1px solid #2a3540"
                    }}
                  >
                    {jsonPretty(workspace.dataQuality)}
                  </pre>
                </details>
              ) : null}
            </section>
          ) : null}

          {workspace.motivos ? (
            <section style={{ ...box, marginBottom: "0.85rem" }}>
              <div style={labelMuted}>Motivos do score</div>
              <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}>{workspace.motivos}</p>
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
                Dados do ScrapeRun {workspace.scrapeRun.id.slice(0, 10)}… ·{" "}
                {workspace.scrapeRun.collectedAt}
              </p>
            ) : null}
          </section>

          {Array.isArray(workspace.imageUrls) && workspace.imageUrls.length > 0 ? (
            <section style={{ marginTop: "0.85rem" }}>
              <div style={{ ...labelMuted, marginBottom: "0.45rem" }}>Imagens no último snapshot</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
                  gap: "0.45rem"
                }}
              >
                {workspace.imageUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>
                    <img
                      src={u}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #334"
                      }}
                    />
                  </a>
                ))}
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
