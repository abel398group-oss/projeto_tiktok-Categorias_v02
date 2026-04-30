import { useCallback, useState } from "react";
import { apiPost } from "./api.js";

/** Igual ao botão «Exportar» nas tabelas Analytics (Spaces). */
export const spacesExportButtonStyle = {
  padding: "0.22rem 0.45rem",
  fontSize: "0.68rem",
  cursor: "pointer",
  borderRadius: 5,
  border: "1px solid #4a7a9e",
  background: "#1a3a52",
  color: "#e8f4ff",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

/**
 * Estado e POST `/analytics/export-product-to-spaces` (credenciais só no servidor).
 */
export function useSpacesExport() {
  const [exportingProductId, setExportingProductId] = useState(/** @type {string | null} */ (null));
  const [exportFeedback, setExportFeedback] = useState(
    /** @type {{ kind: "ok" | "err", text: string } | null} */ (null)
  );

  const exportToSpace = useCallback(async (tiktokProductId) => {
    const id = String(tiktokProductId ?? "").trim();
    if (!id) return;
    setExportingProductId(id);
    setExportFeedback(null);
    try {
      const res = await apiPost("/analytics/export-product-to-spaces", { productId: id });
      const prefix = typeof res?.prefix === "string" ? res.prefix : "";
      const up = typeof res?.imagesUploaded === "number" ? res.imagesUploaded : 0;
      const disc = typeof res?.imagesDiscovered === "number" ? res.imagesDiscovered : 0;
      const fail = typeof res?.imagesFailed === "number" ? res.imagesFailed : 0;
      setExportFeedback({
        kind: "ok",
        text: `Enviado: ${prefix || "ok"} · imagens ${up}/${disc}${fail ? ` (${fail} falhas)` : ""}.`
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setExportFeedback({ kind: "err", text });
    } finally {
      setExportingProductId(null);
    }
  }, []);

  return { exportingProductId, exportFeedback, exportToSpace };
}

/** Barra de estado após export ao Space. */
export function SpacesExportFeedback({ feedback }) {
  if (!feedback) return null;
  return (
    <p
      role="status"
      style={{
        fontSize: "0.72rem",
        marginBottom: "0.45rem",
        padding: "0.35rem 0.5rem",
        borderRadius: 6,
        background: feedback.kind === "ok" ? "rgba(40, 120, 80, 0.2)" : "rgba(180, 60, 60, 0.18)",
        color: feedback.kind === "ok" ? "#b8e6c8" : "#ffb3b3"
      }}
    >
      {feedback.text}
    </p>
  );
}

/**
 * Coluna não ordenável: export quando há `productId` TikTok.
 * @param {{ productId?: unknown, exportingProductId: string | null, exportToSpace: (id: string) => void, tdStyle?: import("react").CSSProperties }} p
 */
export function SpacesExportActionCell({ productId, exportingProductId, exportToSpace, tdStyle }) {
  const id = productId != null && String(productId).trim() !== "" ? String(productId).trim() : null;
  if (!id) {
    return <td style={tdStyle}>—</td>;
  }
  const busy = exportingProductId === id;
  return (
    <td style={tdStyle}>
      <button
        type="button"
        title="Exportar ao DigitalOcean Spaces"
        style={{
          ...spacesExportButtonStyle,
          opacity: busy ? 0.55 : 1,
          cursor: busy ? "wait" : exportingProductId != null ? "default" : "pointer"
        }}
        disabled={exportingProductId != null}
        onClick={() => exportToSpace(id)}
      >
        {busy ? "…" : "Exportar"}
      </button>
    </td>
  );
}
