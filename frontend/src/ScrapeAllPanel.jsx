import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiPost } from "./api.js";

/**
 * Painel de coleta de TODAS as categorias com parar/continuar (checkpoint no servidor).
 * - Iniciar: dispara a coleta em segundo plano no servidor (continua de onde parou).
 * - Parar: pede parada graciosa; encerra após a categoria atual sem perder o progresso.
 * - Barra de progresso via polling de GET /scrape/all/status.
 *
 * @param {{ disabled?: boolean, onFinished?: () => void }} props
 */
export default function ScrapeAllPanel({ disabled = false, onFinished }) {
  const [status, setStatus] = useState(
    /** @type {null | Record<string, unknown>} */ (null)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const prevRunningRef = useRef(false);
  /** Trava síncrona contra duplo clique — ver comentário em `start`. */
  const ocupadoRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiFetch("/scrape/all/status");
      setStatus(s);
      // "Ativo" = coletando OU finalizando (consolidate + import no servidor).
      const active = Boolean(s.running) || Boolean(s.finalizing);
      // Detecta a transição ativo → terminado (servidor já importou para a base).
      if (prevRunningRef.current && !active) {
        const hasError = s.lastError && String(s.lastError).trim() !== "";
        const collectedNothing = Number(s.completedCount ?? 0) === 0;
        if (hasError && collectedNothing) {
          // Falhou logo no início, sem coletar nada — quase sempre Chrome travado.
          setError(
            "A coleta parou com erro logo ao iniciar (não coletou nada). Causa provável: o Chrome do robô ficou aberto/travado. " +
            "Feche todas as janelas do Chrome aberto pelo robô e clique de novo.\n\nDetalhe técnico:\n" +
            String(s.lastError).slice(-800)
          );
          setNote("");
        } else {
          setError("");
          setNote(
            s.stoppedByUser
              ? `Coleta pausada com ${s.completedCount}/${s.totalCount} categorias. Base atualizada. Clique em Continuar quando quiser.`
              : s.done
                ? "Todas as categorias foram coletadas e a base foi atualizada!"
                : hasError
                  ? `Coleta encerrada com ${s.completedCount}/${s.totalCount} categorias (algumas falharam). Base atualizada — clique em Continuar para tentar as que faltam.`
                  : `Coleta encerrada. ${s.completedCount}/${s.totalCount} categorias na base.`
          );
          // O servidor já consolidou e importou; aqui só recarregamos os cartões.
          onFinished?.();
        }
      }
      prevRunningRef.current = active;
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [onFinished]);

  // Estado inicial + polling enquanto está a correr.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      const s = await fetchStatus();
      const interval = s?.running ? 3000 : 15000;
      timer = setTimeout(tick, interval);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchStatus]);

  const start = useCallback(async () => {
    // A trava é a ref, não o estado.
    //
    // `setBusy(true)` só tem efeito no render seguinte: entre dois cliques
    // rápidos, o `busy` desta closure ainda é `false` e o segundo clique passa.
    // Medido com o botão a ser martelado: 5 cliques → 3 coletas disparadas, ou
    // seja três Chrome a bater no TikTok pelo mesmo IP ao mesmo tempo — a
    // receita conhecida para apanhar captcha. A ref muda no próprio instante do
    // clique, por isso fecha a porta; o estado continua a existir só para o
    // botão poder mostrar que está ocupado.
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setBusy(true);
    setError("");
    setNote("");
    try {
      // Se o ciclo anterior já tinha terminado (212/212), o servidor só olha
      // o checkpoint, vê tudo "concluído" e sai sem coletar nada — o TikTok
      // muda todo dia (preço, vendas, ranking), então um ciclo "feito" ontem
      // está desatualizado hoje. Só reseta quando o ciclo anterior estava de
      // fato completo; uma coleta interrompida a meio continua retomando de
      // onde parou (sem reset), preservando o "Parar e continuar depois".
      const reset = Boolean(status?.done);
      await apiPost("/scrape/all/start", reset ? { reset: true } : {});
      prevRunningRef.current = true;
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      ocupadoRef.current = false;
      setBusy(false);
    }
  }, [fetchStatus, status]);

  const stop = useCallback(async () => {
    // Mesma trava do arranque: parar duas vezes não faz mal ao TikTok, mas
    // manda dois pedidos e confunde a mensagem que aparece ao utilizador.
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await apiPost("/scrape/all/stop", {});
      setNote(typeof r?.message === "string" ? r.message : "Parada solicitada.");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      ocupadoRef.current = false;
      setBusy(false);
    }
  }, [fetchStatus]);

  const running = Boolean(status?.running);
  const stopping = Boolean(status?.stopping);
  const done = Boolean(status?.done);
  const completed = Number(status?.completedCount ?? 0);
  const total = Number(status?.totalCount ?? 0);
  const percent = Number(status?.percent ?? 0);
  const remaining = Number(status?.remaining ?? Math.max(0, total - completed));
  const currentLabel = status?.currentLabel != null ? String(status.currentLabel) : "";
  // Categorias que não deram produto. Antes entravam no checkpoint como
  // concluídas e a barra chegava a 100% com buraco na base — o pior tipo de
  // erro, porque parece sucesso.
  const falhas = Array.isArray(status?.failed) ? status.failed : [];
  const desistidas = Number(status?.gaveUpCount ?? 0);

  const startLabel = completed > 0 && !done ? "Continuar coleta" : "Coletar TODAS as categorias";

  return (
    <section
      aria-label="Coleta de todas as categorias"
      style={{
        marginTop: "1rem",
        padding: "0.9rem 1rem",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(26,74,61,0.20), rgba(0,0,0,0.12))"
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "0.98rem", color: "#d8f5ec" }}>
            Coleta completa (todas as {total || "212"} categorias)
          </h2>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", opacity: 0.82, maxWidth: "44rem", lineHeight: 1.45 }}>
            Roda no servidor, uma categoria de cada vez, com pausas para evitar bloqueio. Pode{" "}
            <strong>parar a qualquer momento</strong> e continuar depois — não recomeça do zero.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
          {!running ? (
            <button
              type="button"
              className="tk-btn-soft"
              disabled={disabled || busy}
              style={{ borderColor: "#3d7a6a", background: "#1a4a3d", color: "#d8f5ec", fontWeight: 600 }}
              onClick={() => void start()}
            >
              {busy ? "A iniciar…" : startLabel}
            </button>
          ) : (
            <button
              type="button"
              className="tk-btn-soft"
              disabled={busy || stopping}
              style={{ borderColor: "#7a3d3d", background: "#4a1a1a", color: "#f5d8d8", fontWeight: 600 }}
              onClick={() => void stop()}
            >
              {stopping ? "A parar…" : busy ? "…" : "Parar"}
            </button>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      {(running || completed > 0) && total > 0 ? (
        <div style={{ marginTop: "0.8rem" }}>
          <div
            style={{
              height: "10px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.10)",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, percent))}%`,
                height: "100%",
                background: done ? "#34d399" : "#4ade80",
                transition: "width 0.4s ease"
              }}
            />
          </div>
          <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", opacity: 0.9, display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
            <span><strong>{completed}</strong> / {total} concluídas ({percent}%)</span>
            <span>Restantes: <strong>{remaining}</strong></span>
            {falhas.length > 0 ? (
              <span style={{ color: "#fbbf24" }} title="Não entraram como concluídas: voltam à fila na próxima coleta.">
                Falharam: <strong>{falhas.length}</strong>
                {desistidas > 0 ? ` (${desistidas} de fora)` : ""}
              </span>
            ) : null}
            {running && currentLabel ? <span>A colectar: <strong>{currentLabel}</strong></span> : null}
            {stopping ? <span style={{ color: "#fbbf24" }}>Parada solicitada — a encerrar após a categoria atual…</span> : null}
          </div>
        </div>
      ) : null}

      {falhas.length > 0 ? (
        <details style={{ marginTop: "0.7rem", fontSize: "0.8rem" }}>
          <summary style={{ cursor: "pointer", color: "#fbbf24" }}>
            {falhas.length} categoria(s) sem produto — ver motivos
          </summary>
          <p style={{ margin: "0.5rem 0 0.4rem", opacity: 0.8, lineHeight: 1.45 }}>
            Estas categorias <strong>não</strong> contam como coletadas e voltam à fila sozinhas na
            próxima execução. As marcadas «de fora» esgotaram as tentativas — para as forçar de novo,
            use <code>--reset</code>.
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
            {falhas.map((f) => {
              const nome = String(f.url ?? "").split("/br/c/")[1] ?? String(f.url ?? "");
              return (
                <li key={String(f.url)}>
                  <strong>{nome}</strong> — {String(f.motivo ?? "motivo não registado")}
                  <span style={{ opacity: 0.7 }}> ({f.tentativas}× )</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {note ? (
        <p style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: done ? "var(--tk-accent)" : "#fbbf24", lineHeight: 1.45 }}>
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "var(--tk-danger)", lineHeight: 1.45, whiteSpace: "pre-line", wordBreak: "break-word" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
