import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";
import PdpEnrichButton from "./PdpEnrichButton.jsx";
import { Tag } from "./ui.jsx";
import { getParametrosSinais, PARAMETROS_MUDARAM_EVENT } from "./parametrosSinais.js";

/**
 * Sinais aditivos por produto — etiquetas que SOMAM contexto, nunca decretam
 * veredito (padrão do product-seeker: um sinal isolado não aprova nem reprova;
 * o conjunto é que informa a decisão).
 *
 * Cada sinal carrega a explicação no tooltip: etiqueta sem porquê vira jargão.
 * Os cortes vêm da tela de Parâmetros (ajustáveis por navegador); os padrões e
 * as fontes de cada número moram em parametrosSinais.js.
 *
 * @param {Record<string, any>} l linha do relatório de score
 * @param {Record<string, number>} [cortes] cortes em vigor (padrão: os guardados)
 * @returns {Array<{ id: string, kind: string, texto: string, ajuda: string }>}
 */
export function sinaisDaLinha(l, cortes = getParametrosSinais()) {
  const sinais = [];
  const vendas = Number(String(l?.vendas ?? "").replace(/[^\d]/g, "")) || 0;
  const ritmo = Number.isFinite(l?.vendasPorDia) ? Number(l.vendasPorDia) : null;
  const medido = l?.crescimentoMedido === true;
  const nota = Number.isFinite(l?.ratingAverage) ? Number(l.ratingAverage) : null;

  if (medido && ritmo != null && ritmo >= cortes.ascensao_min_por_dia) {
    sinais.push({
      id: "ascensao",
      kind: "bom",
      texto: "em ascensão",
      ajuda: `Vendendo ${ritmo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia na janela medida — ainda há espaço para novos criadores.`
    });
  }
  if (vendas >= cortes.demanda_min_vendas) {
    sinais.push({
      id: "demanda",
      kind: "bom",
      texto: "demanda provada",
      ajuda: `${vendas.toLocaleString("pt-BR")} vendas acumuladas: o mercado já validou o produto.`
    });
  }
  if (vendas >= cortes.disputado_min_vendas) {
    sinais.push({
      id: "disputado",
      kind: "meio",
      texto: "muito disputado",
      ajuda: "Vendas acumuladas altíssimas — muita gente já promove; o vídeo precisa de um ângulo próprio para furar."
    });
  }
  if (medido && ritmo === 0) {
    sinais.push({
      id: "parado",
      kind: "meio",
      texto: "parado",
      ajuda: "Zero vendas na janela medida. Não é ausência de dado: foi medido e não vendeu."
    });
  }
  if (nota != null && nota < cortes.nota_fraca_max) {
    sinais.push({
      id: "nota-fraca",
      kind: "ruim",
      texto: "nota fraca",
      ajuda: `Avaliação ${nota} — abaixo de ${cortes.nota_fraca_max} costuma significar devolução e reclamação, que sujam o perfil de quem promove.`
    });
  }
  if (l?.enriched) {
    sinais.push({
      id: "galeria",
      kind: "info",
      texto: "com galeria",
      ajuda: "Já enriquecido: fotos da página do produto disponíveis para gerar vídeo sem esperar."
    });
  }
  return sinais;
}

/**
 * Ranking — a tela de decisão: que produto vale promover agora.
 *
 * Lê `/analytics/product-score` uma única vez e reordena no cliente. O relatório
 * já traz score, vendas, nota e a variação face à coleta anterior, por isso não
 * há motivo para quatro pedidos diferentes ao servidor.
 */

const ORDENACOES = [
  {
    id: "delta",
    label: "Em ascensão",
    campo: "vendasPorDia",
    ajuda: "Quem está vendendo mais por DIA agora. Ritmo, não total acumulado: produto com muitas vendas somadas já está saturado; quem está subindo agora ainda tem espaço."
  },
  { id: "vendas", label: "Mais vendidos", campo: "vendas", ajuda: "Volume total de vendas. Validado, mas normalmente já com muita gente a promover." },
  { id: "rating", label: "Melhor nota", campo: "rating", ajuda: "Nota média das avaliações. Reduz risco de devolução." },
  { id: "score", label: "Score", campo: "score", ajuda: "Combinação de vendas, nota, preço e variação, calculada pelo relatório." }
];

/** Converte os campos do relatório (que chegam como texto, "—" ou "") em número ordenável. */
function num(valor) {
  if (valor == null) return Number.NEGATIVE_INFINITY;
  const limpo = String(valor).replace(/[^\d,.-]/g, "").replace(",", ".");
  if (limpo.trim() === "") return Number.NEGATIVE_INFINITY;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

function formatarPreco(valor) {
  const n = num(valor);
  if (!Number.isFinite(n) || n === Number.NEGATIVE_INFINITY) {
    return valor != null && String(valor).trim() !== "" ? String(valor) : "—";
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarInteiro(valor) {
  const n = num(valor);
  if (!Number.isFinite(n) || n === Number.NEGATIVE_INFINITY) return "—";
  return n.toLocaleString("pt-BR");
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function RankingPage() {
  const navigate = useNavigate();
  const [relatorio, setRelatorio] = useState(null);
  // Re-render quando os Parâmetros mudam (mesma aba ou outra): os sinais leem
  // os cortes na hora, só falta o React saber que precisa redesenhar.
  const [versaoParametros, setVersaoParametros] = useState(0);
  useEffect(() => {
    const bump = () => setVersaoParametros((x) => x + 1);
    window.addEventListener(PARAMETROS_MUDARAM_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PARAMETROS_MUDARAM_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ordem, setOrdem] = useState("delta");

  // Ocultar é soft-hide no servidor (histórico preservado); aqui só tira da
  // vista sem esperar recarregar o relatório inteiro — a lista já veio, não
  // há motivo para um pedido novo só para sumir com uma linha.
  const [ocultosLocal, setOcultosLocal] = useState(() => new Set());
  const [ocultando, setOcultando] = useState(() => new Set());
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [avisoOcultar, setAvisoOcultar] = useState("");

  async function ocultarProduto(pid) {
    if (!pid || ocultando.has(pid)) return;
    setOcultando((s) => new Set(s).add(pid));
    setAvisoOcultar("");
    try {
      await apiPost(`/analytics/product-hide/${encodeURIComponent(pid)}`, {});
      setOcultosLocal((s) => new Set(s).add(pid));
      setSelecionados((s) => {
        if (!s.has(pid)) return s;
        const novo = new Set(s);
        novo.delete(pid);
        return novo;
      });
    } catch (e) {
      setAvisoOcultar(e?.message ? String(e.message) : "Falha ao ocultar produto.");
    } finally {
      setOcultando((s) => {
        const novo = new Set(s);
        novo.delete(pid);
        return novo;
      });
    }
  }

  async function ocultarSelecionados() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setAvisoOcultar("");
    try {
      await apiPost("/analytics/product-hide-batch", { productIds: ids });
      setOcultosLocal((s) => {
        const novo = new Set(s);
        ids.forEach((id) => novo.add(id));
        return novo;
      });
      setSelecionados(new Set());
    } catch (e) {
      setAvisoOcultar(e?.message ? String(e.message) : "Falha ao ocultar selecionados.");
    }
  }

  function alternarSelecao(pid) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(pid)) novo.delete(pid);
      else novo.add(pid);
      return novo;
    });
  }

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    apiFetch("/analytics/product-score")
      .then((body) => {
        if (ativo) setRelatorio(body);
      })
      .catch((e) => {
        if (ativo) setErro(e?.message ? String(e.message) : "Falha ao carregar o ranking.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const ordenacaoAtiva = ORDENACOES.find((o) => o.id === ordem) ?? ORDENACOES[0];

  const linhas = useMemo(() => {
    const top = Array.isArray(relatorio?.top) ? relatorio.top : [];
    const visiveis = top.filter((r) => !ocultosLocal.has(String(r?.productId ?? "").trim()));
    const campo = ordenacaoAtiva.campo;
    return [...visiveis].sort((a, b) => num(b?.[campo]) - num(a?.[campo]));
  }, [relatorio, ordenacaoAtiva, ocultosLocal]);

  const temComparacao = Boolean(relatorio?.previousRun);

  /** Janela em que o crescimento foi medido, em horas (null = sem base ainda). */
  const janelaHoras = Number.isFinite(relatorio?.janelaHoras) ? Number(relatorio.janelaHoras) : null;

  /** "4,5 dias" lê-se melhor do que "106,9 h" quando a janela é longa. */
  const janelaTexto = useMemo(() => {
    if (janelaHoras == null) return "";
    if (janelaHoras < 48) return `${Math.round(janelaHoras)} h`;
    const dias = janelaHoras / 24;
    return `${dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
  }, [janelaHoras]);

  /**
   * Ter uma coleta anterior não chega: se as duas correram com minutos de
   * diferença, nada mudou e todas as variações são zero. Nesse caso ordenar por
   * «Em ascensão» não diz nada, e é preciso avisar em vez de mostrar uma lista
   * que parece ordenada mas não está.
   */
  const temVariacaoUtil = useMemo(() => {
    const top = Array.isArray(relatorio?.top) ? relatorio.top : [];
    return top.some((r) => Number.isFinite(r?.vendasPorDia) && Number(r.vendasPorDia) !== 0);
  }, [relatorio]);

  /** Quantos produtos têm ritmo realmente medido (base + janela), para a legenda. */
  const quantosMedidos = useMemo(() => {
    const top = Array.isArray(relatorio?.top) ? relatorio.top : [];
    return top.filter((r) => r?.crescimentoMedido && Number(r?.vendasPorDia) > 0).length;
  }, [relatorio]);

  /**
   * Legenda-medidor: cada sinal com a contagem no conjunto listado. A legenda
   * também é um sumário — "3 em ascensão" já diz por onde começar sem ler a
   * tabela inteira (padrão do product-seeker).
   */
  const contagemSinais = useMemo(() => {
    const top = Array.isArray(relatorio?.top) ? relatorio.top : [];
    /** @type {Map<string, { kind: string, texto: string, ajuda: string, n: number }>} */
    const mapa = new Map();
    for (const linha of top) {
      for (const s of sinaisDaLinha(linha)) {
        const atual = mapa.get(s.id);
        if (atual) atual.n += 1;
        else mapa.set(s.id, { kind: s.kind, texto: s.texto, ajuda: s.ajuda, n: 1 });
      }
    }
    return [...mapa.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio, versaoParametros]);

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1>Ranking</h1>
        <p style={{ opacity: 0.85, marginTop: "0.25rem" }}>
          {carregando
            ? "A carregar…"
            : `${linhas.length} produto(s) · coleta de ${formatarData(relatorio?.scrapeRun?.collectedAt)}`}
          {temComparacao && janelaTexto
            ? ` · ritmo medido sobre ${janelaTexto} (desde ${formatarData(relatorio?.previousRun?.collectedAt)})`
            : temComparacao
              ? ` · comparado com ${formatarData(relatorio?.previousRun?.collectedAt)}`
              : null}
        </p>

        {!carregando && !erro && linhas.length > 0 && temVariacaoUtil ? (
          <p style={{ fontSize: "0.74rem", opacity: 0.75, marginTop: "0.3rem" }}>
            {quantosMedidos} produto(s) com venda medida nesta janela. Os restantes ficaram parados
            ou entraram na base depois da leitura anterior.
          </p>
        ) : null}

        {!carregando && !erro && linhas.length > 0 && !temVariacaoUtil ? (
          <p
            style={{
              fontSize: "0.78rem",
              marginTop: "0.6rem",
              padding: "0.5rem 0.7rem",
              borderRadius: "6px",
              border: "1px solid var(--tk-border)",
              background: "var(--tk-bg-elev, transparent)"
            }}
          >
            <strong>Nenhum produto com ritmo de venda medido.</strong>{" "}
            {temComparacao
              ? "Houve leitura anterior, mas nenhum produto vendeu entre as duas. Ordenar por «Em ascensão» não separa nada — use Score ou Mais vendidos."
              : "Ainda não há duas coletas afastadas o suficiente (mínimo 12 h) para medir ritmo. Colete de novo amanhã e esta coluna passa a funcionar."}
          </p>
        ) : null}

        {relatorio?.message ? (
          <p style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: "0.4rem" }}>{String(relatorio.message)}</p>
        ) : null}

        {erro ? (
          <p role="alert" style={{ marginTop: "0.75rem", color: "var(--tk-danger, #f85149)" }}>
            {erro}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "1rem 0 0.5rem" }}>
          {ORDENACOES.map((o) => {
            const ativo = o.id === ordem;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrdem(o.id)}
                aria-pressed={ativo}
                title={o.ajuda}
                className="tk-nav-link"
                style={{
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.75rem",
                  borderRadius: "999px",
                  border: `1px solid ${ativo ? "var(--tk-accent, #f0883e)" : "var(--tk-border)"}`,
                  background: ativo ? "var(--tk-accent-soft, rgba(240,136,62,.14))" : "transparent",
                  color: ativo ? "var(--tk-accent, #f0883e)" : "inherit",
                  fontWeight: ativo ? 600 : 400
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: "0.74rem", opacity: 0.75, marginBottom: "0.6rem" }}>{ordenacaoAtiva.ajuda}</p>

        {avisoOcultar ? (
          <p role="alert" style={{ marginTop: "0.5rem", color: "var(--tk-danger, #f85149)" }}>
            {avisoOcultar}
          </p>
        ) : null}

        {selecionados.size > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              margin: "0.6rem 0",
              padding: "0.4rem 0.7rem",
              borderRadius: "6px",
              border: "1px solid var(--tk-border)",
              background: "var(--tk-bg-elev, transparent)"
            }}
          >
            <span style={{ fontSize: "0.8rem" }}>{selecionados.size} selecionado(s)</span>
            <button
              type="button"
              onClick={ocultarSelecionados}
              className="tk-nav-link"
              style={{
                cursor: "pointer",
                fontSize: "0.78rem",
                padding: "0.25rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--tk-danger, #f85149)",
                color: "var(--tk-danger, #f85149)",
                background: "transparent"
              }}
            >
              Ocultar selecionados
            </button>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              style={{
                cursor: "pointer",
                fontSize: "0.78rem",
                padding: "0.25rem 0.6rem",
                border: "none",
                background: "transparent",
                opacity: 0.75,
                textDecoration: "underline"
              }}
            >
              limpar seleção
            </button>
          </div>
        ) : null}

        {contagemSinais.length > 0 ? (
          <p style={{ margin: "0 0 0.6rem" }}>
            {contagemSinais.map((s) => (
              <Tag key={s.texto} kind={s.kind} title={s.ajuda}>
                {s.texto} · {s.n}
              </Tag>
            ))}
          </p>
        ) : null}

        {!carregando && linhas.length === 0 && !erro ? (
          <p style={{ opacity: 0.85 }}>
            Sem produtos na base. Vá a <strong>Categorias</strong> e faça uma coleta primeiro.
          </p>
        ) : null}

        {linhas.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table
              className="tk-analytics-table"
              style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--tk-border)", textAlign: "left" }}>
                  {[
                    { t: "" },
                    { t: "#" },
                    { t: "produto" },
                    { t: "loja" },
                    { t: "preço" },
                    { t: "nota" },
                    { t: "vendas", ajuda: "Total acumulado desde que o produto existe." },
                    {
                      t: "vendas/dia",
                      ajuda: janelaTexto
                        ? `Ritmo atual, medido sobre ${janelaTexto}. É isto que separa produto em ascensão de produto saturado.`
                        : "Ritmo atual. Precisa de duas coletas afastadas pelo menos 12 h."
                    },
                    { t: "sinais", ajuda: "Sinais somam contexto, não decretam veredito. Passe o rato em cada etiqueta para ver o critério." },
                    { t: "score" },
                    { t: "" }
                  ].map((h, i) => (
                    <th
                      key={`${h.t}-${i}`}
                      title={h.ajuda}
                      style={{
                        padding: "0.4rem 0.45rem",
                        fontWeight: 600,
                        cursor: h.ajuda ? "help" : "default"
                      }}
                    >
                      {h.t}
                      {h.ajuda ? <span style={{ opacity: 0.5, marginLeft: "0.2rem" }}>ⓘ</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((raw, i) => {
                  const linha = raw ?? {};
                  const pid = linha.productId != null ? String(linha.productId).trim() : "";
                  // Ritmo medido é diferente de ritmo zero: um é "não sei", o
                  // outro é "sei que está parado". A tela tem de distinguir os
                  // dois, senão produto novo parece produto encalhado.
                  const ritmo = Number.isFinite(linha.vendasPorDia) ? Number(linha.vendasPorDia) : null;
                  const temRitmo = linha.crescimentoMedido === true && ritmo != null;
                  return (
                    <tr
                      key={pid || `r-${i}`}
                      style={{ borderBottom: "1px solid var(--tk-border)" }}
                    >
                      <td style={{ padding: "0.35rem 0.45rem" }}>
                        {pid ? (
                          <input
                            type="checkbox"
                            checked={selecionados.has(pid)}
                            onChange={() => alternarSelecao(pid)}
                            aria-label={`Selecionar ${linha.nome ?? pid}`}
                          />
                        ) : null}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", opacity: 0.7 }}>{i + 1}</td>
                      <td style={{ padding: "0.35rem 0.45rem", maxWidth: "22rem" }}>
                        {pid ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/produto/${encodeURIComponent(pid)}`)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                              color: "inherit",
                              textAlign: "left",
                              cursor: "pointer",
                              textDecoration: "underline"
                            }}
                            title="Abrir o workspace do produto"
                          >
                            {linha.nome != null ? String(linha.nome) : "—"}
                          </button>
                        ) : (
                          <span>{linha.nome != null ? String(linha.nome) : "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", opacity: 0.85 }}>
                        {linha.loja != null ? String(linha.loja) : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem" }}>{formatarPreco(linha.preco)}</td>
                      <td style={{ padding: "0.35rem 0.45rem" }}>
                        {linha.rating != null && String(linha.rating).trim() !== "" ? String(linha.rating) : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem" }}>
                        <span className="tk-metric">{formatarInteiro(linha.vendas)}</span>
                      </td>
                      <td
                        title={
                          temRitmo
                            ? `${linha.deltaVendas} venda(s) em ${linha.janelaHoras} h`
                            : "Sem leitura anterior afastada o suficiente para medir ritmo."
                        }
                        style={{
                          padding: "0.35rem 0.45rem",
                          whiteSpace: "nowrap",
                          fontWeight: temRitmo && ritmo > 0 ? 600 : 400,
                          color: temRitmo && ritmo > 0 ? "var(--tk-success, #3fb950)" : "inherit",
                          opacity: temRitmo ? 1 : 0.6,
                          cursor: "help"
                        }}
                      >
                        {temRitmo
                          ? ritmo > 0
                            ? `${ritmo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia`
                            : "parado"
                          : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", maxWidth: "13rem" }}>
                        {sinaisDaLinha(linha).map((s) => (
                          <Tag key={s.id} kind={s.kind} title={s.ajuda}>
                            {s.texto}
                          </Tag>
                        ))}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem" }}>
                        <span className="tk-metric">{linha.score != null ? String(linha.score) : "—"}</span>
                        {linha.classific != null && String(linha.classific).trim() !== "" ? (
                          <span style={{ fontSize: "0.7rem", opacity: 0.75, marginLeft: "0.35rem" }}>
                            {String(linha.classific)}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>
                        {pid ? <PdpEnrichButton productId={pid} inlineHint={false} /> : null}
                        {pid ? (
                          <button
                            type="button"
                            onClick={() => ocultarProduto(pid)}
                            disabled={ocultando.has(pid)}
                            title="Ocultar produto (some do ranking; histórico continua no banco)"
                            style={{
                              marginLeft: "0.4rem",
                              cursor: ocultando.has(pid) ? "wait" : "pointer",
                              fontSize: "0.76rem",
                              padding: "0.15rem 0.5rem",
                              borderRadius: "6px",
                              border: "1px solid var(--tk-border)",
                              background: "transparent",
                              color: "var(--tk-danger, #f85149)",
                              opacity: ocultando.has(pid) ? 0.6 : 1
                            }}
                          >
                            {ocultando.has(pid) ? "…" : "Ocultar"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
