import { useCallback, useEffect, useState } from "react";
import {
  CHOSEN_PRODUCTS_CHANGED_EVENT,
  addChosenProduct,
  isProductChosen
} from "./productChosenStorage.js";

const baseBtn = {
  padding: "0.24rem 0.5rem",
  fontSize: "0.68rem",
  fontWeight: 750,
  whiteSpace: "nowrap"
};

/**
 * @param {{ productId: string, nome?: string, tiktokUrl?: string, className?: string }} props
 */
export default function SendToAnalysisButton({ productId, nome, tiktokUrl, className = "tk-btn-soft" }) {
  const pid = String(productId ?? "").trim();
  const [already, setAlready] = useState(() => (pid ? isProductChosen(pid) : false));
  const [sentPulse, setSentPulse] = useState(false);

  useEffect(() => {
    if (!sentPulse) return undefined;
    const t = window.setTimeout(() => setSentPulse(false), 1800);
    return () => window.clearTimeout(t);
  }, [sentPulse]);

  useEffect(() => {
    if (!pid) return undefined;
    const sync = () => setAlready(isProductChosen(pid));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, sync);
    };
  }, [pid]);

  const onClick = useCallback(
    /** @param {import("react").MouseEvent} e */
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!pid) return;
      if (isProductChosen(pid)) return;
      addChosenProduct({
        productId: pid,
        nome: typeof nome === "string" && nome.trim() ? nome.trim() : undefined,
        tiktokUrl: typeof tiktokUrl === "string" && tiktokUrl.trim() ? tiktokUrl.trim() : undefined
      });
      setAlready(true);
      setSentPulse(true);
    },
    [pid, nome, tiktokUrl]
  );

  if (!pid) {
    return null;
  }

  const label = already ? "Em análise" : "Enviar para análise";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", alignItems: "flex-start" }}>
      <button
        type="button"
        className={className}
        style={{ ...baseBtn, opacity: already ? 0.7 : 1, cursor: already ? "default" : "pointer" }}
        onClick={onClick}
        disabled={already}
        title={already ? "Já está em Produtos em análise" : "Adicionar à lista manual em /a-mao"}
      >
        {label}
      </button>
      {sentPulse ? (
        <span style={{ fontSize: "0.62rem", lineHeight: 1.25, opacity: 0.9, color: "#9dd4b8" }}>
          Produto enviado para análise
        </span>
      ) : null}
    </div>
  );
}
