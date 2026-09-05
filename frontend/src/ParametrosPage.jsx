import { useMemo, useState } from "react";
import { Painel } from "./ui.jsx";
import CortesDoMotor from "./CortesDoMotor.jsx";
import {
  CATALOGO_PARAMETROS,
  getParametrosSinais,
  setParametrosSinais,
  restaurarPadroes,
  padroes
} from "./parametrosSinais.js";

/**
 * Parâmetros — os cortes dos sinais do ranking, editáveis sem deploy.
 *
 * Modelo do product-seeker: cada número com rótulo, unidade, faixa válida e a
 * FONTE (por que este valor e não outro). O botão guardar só aparece quando há
 * mudança; valor fora da faixa não grava.
 *
 * Guardado NESTE navegador (localStorage) — o painel não tem utilizadores, e
 * este é o nome honesto do que a configuração é.
 */
export default function ParametrosPage() {
  const emVigor = useMemo(() => getParametrosSinais(), []);
  const [valores, setValores] = useState(() => ({ ...emVigor }));
  const [gravado, setGravado] = useState("");

  const padrao = padroes();
  const mudou = CATALOGO_PARAMETROS.some((p) => Number(valores[p.chave]) !== Number(emVigor[p.chave]));

  const foraDaFaixa = CATALOGO_PARAMETROS.filter((p) => {
    const v = Number(valores[p.chave]);
    return !Number.isFinite(v) || v < p.min || v > p.max;
  });

  const guardar = () => {
    if (foraDaFaixa.length > 0) return;
    setParametrosSinais(valores);
    setGravado("Guardado. O Ranking já está a usar os novos cortes.");
    setTimeout(() => setGravado(""), 4000);
  };

  const restaurar = () => {
    restaurarPadroes();
    setValores({ ...padrao });
    setGravado("Padrões restaurados.");
    setTimeout(() => setGravado(""), 4000);
  };

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)", maxWidth: "46rem" }}>
        <h1>Parâmetros</h1>
        <p style={{ opacity: 0.8, marginTop: "0.25rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
          Dois conjuntos, e a diferença importa. Os primeiros definem as etiquetas do Ranking
          («em ascensão», «demanda provada»…) e valem para <strong>este navegador</strong>.
          Os segundos são do <strong>motor de score</strong>: valem no servidor, para toda a
          gente, e alimentam também o MoneyPrinter. Os dois aplicam-se na hora.
        </p>

        <Painel titulo="Cortes dos sinais" nota="Cada número traz a fonte: por que este valor e não outro. Ajuste, guarde, e confira o efeito no Ranking.">
          {CATALOGO_PARAMETROS.map((p) => {
            const v = valores[p.chave];
            const invalido = !Number.isFinite(Number(v)) || Number(v) < p.min || Number(v) > p.max;
            const ehPadrao = Number(v) === p.padrao;
            return (
              <div key={p.chave} style={{ margin: "0 0 1.1rem", paddingBottom: "0.9rem", borderBottom: "1px solid var(--tk-border)" }}>
                <label htmlFor={`par-${p.chave}`} style={{ display: "block", fontWeight: 600, fontSize: "0.86rem" }}>
                  {p.rotulo}
                </label>
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", margin: "0.35rem 0" }}>
                  <input
                    id={`par-${p.chave}`}
                    type="number"
                    value={v}
                    min={p.min}
                    max={p.max}
                    step={p.passo ?? 1}
                    onChange={(e) => setValores((prev) => ({ ...prev, [p.chave]: e.target.value === "" ? "" : Number(e.target.value) }))}
                    style={{
                      width: "9rem", padding: "0.4rem 0.6rem", fontSize: "0.9rem", borderRadius: 6,
                      border: `1px solid ${invalido ? "var(--tk-danger, #f85149)" : "var(--tk-border)"}`,
                      background: "var(--tk-bg-elev, transparent)", color: "inherit"
                    }}
                  />
                  <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{p.unidade}</span>
                  {!ehPadrao ? (
                    <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>(padrão: {p.padrao})</span>
                  ) : null}
                </div>
                {invalido ? (
                  <p style={{ color: "var(--tk-danger, #f85149)", fontSize: "0.76rem", margin: "0.2rem 0" }}>
                    Fora da faixa válida ({p.min}–{p.max}).
                  </p>
                ) : null}
                <p style={{ fontSize: "0.74rem", opacity: 0.65, margin: "0.2rem 0 0", lineHeight: 1.45 }}>{p.fonte}</p>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <button
              type="button"
              className="tk-btn-soft"
              disabled={!mudou || foraDaFaixa.length > 0}
              onClick={guardar}
              style={{
                padding: "0.45rem 1rem", fontWeight: 600, borderRadius: 6, cursor: mudou ? "pointer" : "default",
                border: "1px solid #3d7a6a", background: mudou ? "#1a4a3d" : "transparent",
                color: mudou ? "#d8f5ec" : "inherit", opacity: mudou ? 1 : 0.5
              }}
            >
              Guardar
            </button>
            <button
              type="button"
              className="tk-btn-soft"
              onClick={restaurar}
              style={{ padding: "0.45rem 1rem", borderRadius: 6, cursor: "pointer", border: "1px solid var(--tk-border)", background: "transparent", color: "inherit" }}
            >
              Restaurar padrões
            </button>
            {gravado ? <span style={{ fontSize: "0.8rem", color: "var(--tk-success, #3fb950)" }}>{gravado}</span> : null}
          </div>
        </Painel>

        {/*
          Painel separado, e não mais campos no de cima: aqueles valem neste
          navegador, estes valem para toda a gente. Ver CortesDoMotor.jsx.
        */}
        <CortesDoMotor />
      </div>
    </main>
  );
}
