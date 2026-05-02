import { useCallback, useState } from "react";
import { apiPost } from "./api.js";

const btn = {
  padding: "0.22rem 0.45rem",
  fontSize: "0.68rem",
  cursor: "pointer",
  borderRadius: 5,
  border: "1px solid #3d7a6a",
  background: "#1a4a3d",
  color: "#d8f5ec",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

/**
 * Dispara POST /analytics/pdp-enrich com um productId (TikTok).
 * @param {{ productId: string, inlineHint?: boolean }} props
 */
export default function PdpEnrichButton({ productId, inlineHint = true }) {
  const [busy, setBusy] = useState(false);
  /** @type {[{ kind: "ok" | "err", text: string } | null, function]} */
  const [flash, setFlash] = useState(null);

  const onClick = useCallback(async () => {
    const id = String(productId ?? "").trim();
    if (!id) {
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      await apiPost("/analytics/pdp-enrich", { productIds: [id] });
      setFlash({
        kind: "ok",
        text: "PDP enrich iniciado. Quando terminar no servidor, importe o JSON (db:import) e atualize a lista."
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setFlash({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  }, [productId]);

  if (!String(productId ?? "").trim()) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", alignItems: "stretch" }}>
      <button
        type="button"
        title="Corre no servidor: npm run pdp:enrich (ficheiro output/dados_produtos.json)"
        style={{ ...btn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" }}
        disabled={busy}
        onClick={() => void onClick()}
      >
        {busy ? "…" : "Enriquecer PDP"}
      </button>
      {flash && inlineHint ? (
        <span
          role="status"
          style={{
            fontSize: "0.58rem",
            lineHeight: 1.35,
            color: flash.kind === "ok" ? "#9dd4b8" : "#f0a08a",
            maxWidth: "10.5rem"
          }}
        >
          {flash.text}
        </span>
      ) : null}
    </div>
  );
}
