import { useCallback, useEffect, useState } from "react";
import { Painel } from "./ui.jsx";
import { apiFetch, apiPut, apiDelete } from "./api.js";

/**
 * Os cortes do MOTOR de score — os que valem para toda a gente.
 *
 * ┌─ PORQUE ISTO É UM PAINEL SEPARADO, E NÃO MAIS CAMPOS NO DE CIMA ─────
 * │ Os cortes dos sinais do Ranking vivem no `localStorage`: valem neste
 * │ navegador e são preferência de leitura de quem os mexe. Estes decidem
 * │ o que a API devolve a TODA a gente — incluindo ao MoneyPrinter, que
 * │ não tem navegador nenhum e vai gerar vídeo com o que sair daqui.
 * │
 * │ Misturá-los num painel só faria alguém mudar um número julgando que
 * │ era «a minha vista» quando era «o que o robô vai promover». O aviso
 * │ tem de estar ao lado do campo, não numa nota de rodapé.
 * └──────────────────────────────────────────────────────────────────────
 */
export default function CortesDoMotor() {
  const [cortes, setCortes] = useState(/** @type {any[] | null} */ (null));
  const [erro, setErro] = useState("");
  const [rascunho, setRascunho] = useState(/** @type {Record<string, string|number>} */ ({}));
  const [aGravar, setAGravar] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const body = await apiFetch("/analytics/parametros");
      const lista = Array.isArray(body?.cortes) ? body.cortes : [];
      setCortes(lista);
      setRascunho(Object.fromEntries(lista.map((c) => [c.chave, c.valor])));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const mudou = cortes?.some((c) => Number(rascunho[c.chave]) !== Number(c.valor)) ?? false;
  const invalidos = cortes?.filter((c) => {
    const v = Number(rascunho[c.chave]);
    return !Number.isFinite(v) || v < 0;
  }) ?? [];

  const guardar = async () => {
    if (invalidos.length > 0) return;
    setAGravar(true);
    try {
      // Só o que mudou: enviar tudo gravaria linhas iguais ao padrão, e
      // depois «restaurar» deixaria de significar o que significa.
      const valores = {};
      for (const c of cortes) {
        if (Number(rascunho[c.chave]) !== Number(c.valor)) valores[c.chave] = Number(rascunho[c.chave]);
      }
      const r = await apiPut("/analytics/parametros", { valores });
      setCortes(r.cortes);
      setRascunho(Object.fromEntries(r.cortes.map((c) => [c.chave, c.valor])));
      setAviso("Guardado. Os relatórios já estão a usar os novos cortes.");
      setTimeout(() => setAviso(""), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGravar(false);
    }
  };

  /** Voltar ao padrão é APAGAR a linha, não gravar o valor do catálogo. */
  const restaurar = async (chave) => {
    try {
      const r = await apiDelete(`/analytics/parametros/${encodeURIComponent(chave)}`);
      setCortes(r.cortes);
      setRascunho(Object.fromEntries(r.cortes.map((c) => [c.chave, c.valor])));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  if (erro && !cortes) {
    return (
      <Painel titulo="Cortes do motor de score">
        <p style={{ fontSize: "0.82rem" }}>Não consegui ler os cortes do servidor: {erro}</p>
      </Painel>
    );
  }
  if (!cortes) {
    return <Painel titulo="Cortes do motor de score"><p style={{ opacity: 0.7 }}>A carregar…</p></Painel>;
  }

  return (
    <Painel
      titulo="Cortes do motor de score"
      nota="Estes valem no SERVIDOR, para toda a gente — e alimentam também o MoneyPrinter. Mudar um número aqui muda o ranking de toda a base."
    >
      {cortes.map((c) => {
        const v = rascunho[c.chave];
        const invalido = !Number.isFinite(Number(v)) || Number(v) < 0;
        return (
          <div key={c.chave} style={{ margin: "0 0 1.1rem", paddingBottom: "0.9rem", borderBottom: "1px solid var(--tk-border)" }}>
            <label htmlFor={`motor-${c.chave}`} style={{ display: "block", fontWeight: 600, fontSize: "0.86rem" }}>
              {c.chave}
            </label>
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", margin: "0.35rem 0", flexWrap: "wrap" }}>
              <input
                id={`motor-${c.chave}`}
                type="number"
                value={v}
                min={0}
                step="any"
                onChange={(e) => setRascunho((p) => ({ ...p, [c.chave]: e.target.value === "" ? "" : Number(e.target.value) }))}
                style={{
                  width: "9rem", padding: "0.4rem 0.6rem", fontSize: "0.9rem", borderRadius: 6,
                  border: `1px solid ${invalido ? "var(--tk-danger, #f85149)" : "var(--tk-border)"}`,
                  background: "var(--tk-bg-elev, transparent)", color: "inherit"
                }}
              />
              <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{c.unidade}</span>
              {c.origem === "ajustado" ? (
                <>
                  <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>(padrão: {c.padrao})</span>
                  <button type="button" className="tk-btn-soft" onClick={() => void restaurar(c.chave)}
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: 5, border: "1px solid var(--tk-border)", background: "transparent", color: "inherit", cursor: "pointer" }}>
                    voltar ao padrão
                  </button>
                </>
              ) : null}
            </div>
            <p style={{ fontSize: "0.74rem", opacity: 0.72, margin: "0.2rem 0 0", lineHeight: 1.45 }}>{c.descricao}</p>
            <p style={{ fontSize: "0.72rem", opacity: 0.55, margin: "0.2rem 0 0" }}>fonte: {c.fonte}</p>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="tk-btn-soft"
          disabled={!mudou || invalidos.length > 0 || aGravar}
          onClick={() => void guardar()}
          style={{
            padding: "0.45rem 1rem", fontWeight: 600, borderRadius: 6,
            cursor: mudou && !aGravar ? "pointer" : "default",
            border: "1px solid #3d7a6a", background: mudou ? "#1a4a3d" : "transparent",
            color: mudou ? "#d8f5ec" : "inherit", opacity: mudou ? 1 : 0.5
          }}
        >
          {aGravar ? "A guardar…" : "Guardar no servidor"}
        </button>
        {aviso ? <span style={{ fontSize: "0.8rem", color: "var(--tk-success, #3fb950)" }}>{aviso}</span> : null}
        {erro ? <span style={{ fontSize: "0.8rem", color: "var(--tk-danger, #f85149)" }}>{erro}</span> : null}
      </div>
    </Painel>
  );
}
