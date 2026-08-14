import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { Card, Painel, Tag } from "./ui.jsx";

/**
 * Estatísticas por categoria — onde está o giro AGORA.
 *
 * Tudo aqui segue a higiene do relatório: mediana em vez de média, faixa
 * p25–p75 em vez de número único, `n` visível em cada linha (estatística de 3
 * produtos apresenta-se como anedota, não como fato), e quadrantes calculados
 * pelas medianas do próprio conjunto — cortes que acompanham os dados em vez
 * de envelhecer num arquivo.
 */

const QUADRANTES = [
  { id: "porta_aberta", kind: "bom", texto: "porta aberta", ajuda: "Mais barato que a mediana E girando acima da mediana: fácil de vender, entrada natural." },
  { id: "vale_o_angulo", kind: "info", texto: "vale o ângulo", ajuda: "Mais caro que a mediana mas girando: comissão maior por venda, exige um vídeo com ângulo próprio." },
  { id: "sem_tracao", kind: "meio", texto: "sem tração", ajuda: "Barato e mesmo assim parado — desconfiar do produto, não do preço." },
  { id: "evitar", kind: "ruim", texto: "evitar", ajuda: "Caro e parado: o pior dos dois mundos." }
];

function moeda(n) {
  return typeof n === "number" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

export default function EstatisticasPage() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    apiFetch("/analytics/category-stats")
      .then((body) => { if (ativo) setDados(body); })
      .catch((e) => { if (ativo) setErro(e?.message ? String(e.message) : "Falha ao carregar."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const categorias = useMemo(() => (Array.isArray(dados?.categorias) ? dados.categorias : []), [dados]);
  const comGiro = useMemo(
    () => categorias.filter((c) => (c?.estatisticas?.vendasPorDia?.totalMedido ?? 0) > 0),
    [categorias]
  );
  const janela = Number.isFinite(dados?.janelaHoras) ? Number(dados.janelaHoras) : null;
  const janelaTexto = janela == null ? "" : janela < 48 ? `${Math.round(janela)} h` : `${(janela / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1>Estatísticas</h1>
        <p style={{ opacity: 0.85, marginTop: "0.25rem", fontSize: "0.85rem" }}>
          {carregando
            ? "A carregar…"
            : `${categorias.length} categoria(s) · ${Number(dados?.totalProdutos ?? 0).toLocaleString("pt-BR")} produtos` +
              (janelaTexto ? ` · giro medido sobre ${janelaTexto}` : "")}
        </p>
        {erro ? <p role="alert" style={{ color: "var(--tk-danger, #f85149)" }}>{erro}</p> : null}

        {!carregando && !erro ? (
          <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", margin: "0.9rem 0" }}>
            <Card
              rotulo="Categorias com giro medido"
              valor={comGiro.length}
              sub={`de ${categorias.length} na base`}
              title="Categorias onde pelo menos um produto teve venda registada entre as duas leituras da janela."
            />
            <Card
              rotulo="Maior giro"
              valor={comGiro[0] ? `${Math.round(comGiro[0].estatisticas.vendasPorDia.totalMedido).toLocaleString("pt-BR")}/dia` : "—"}
              sub={comGiro[0] ? comGiro[0].categoria.split(" · ").slice(1, 2).join("") || comGiro[0].categoria : ""}
              title="Soma das vendas/dia medidas dos produtos da categoria líder."
            />
          </div>
        ) : null}

        {!carregando && !erro ? (
          <Painel
            titulo="Onde está o giro"
            nota="Ordenado pelo giro medido (vendas/dia somadas). Preço típico é a faixa p25–p75 pela mediana — metade dos produtos da categoria custa dentro dela. Quadrantes: cada produto medido comparado com as medianas da própria categoria."
          >
            <div style={{ overflowX: "auto" }}>
              <table className="tk-analytics-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--tk-border)", textAlign: "left" }}>
                    {[
                      { t: "categoria" },
                      { t: "produtos", a: "Quantos produtos desta categoria estão na base (n)." },
                      { t: "giro medido", a: "Vendas/dia somadas dos produtos com ritmo medido — e quantos produtos sustentam o número." },
                      { t: "preço típico", a: "Faixa p25–p75: metade dos produtos custa dentro dela. Mediana entre parênteses." },
                      { t: "lojas", a: "Lojas distintas na categoria — muitas lojas = demanda provada, não mercado queimado." },
                      { t: "quadrantes", a: "Produtos medidos, classificados pelas medianas da própria categoria. Passe o rato em cada etiqueta." }
                    ].map((h) => (
                      <th key={h.t} title={h.a} style={{ padding: "0.4rem 0.45rem", fontWeight: 600, cursor: h.a ? "help" : "default" }}>
                        {h.t}{h.a ? <span style={{ opacity: 0.5, marginLeft: "0.2rem" }}>ⓘ</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categorias.slice(0, 60).map((c) => {
                    const e = c.estatisticas;
                    const q = c.quadrantes;
                    return (
                      <tr key={c.categoria} style={{ borderBottom: "1px solid var(--tk-border)" }}>
                        <td style={{ padding: "0.35rem 0.45rem", maxWidth: "18rem" }}>{c.categoria.replace(/^TikTok Shop · /, "")}</td>
                        <td style={{ padding: "0.35rem 0.45rem" }}>{e.n}</td>
                        <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>
                          {e.vendasPorDia.totalMedido > 0 ? (
                            <>
                              <strong>{Math.round(e.vendasPorDia.totalMedido).toLocaleString("pt-BR")}/dia</strong>{" "}
                              <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>({e.vendasPorDia.n} medido{e.vendasPorDia.n === 1 ? "" : "s"})</span>
                            </>
                          ) : e.vendasPorDia.n > 0 ? (
                            // Medido e deu zero ≠ não medido: aqui houve leitura
                            // e ninguém vendeu — informação valiosa (categoria
                            // fria), não ausência de dado.
                            <span style={{ opacity: 0.75 }} title={`${e.vendasPorDia.n} produto(s) medidos, todos sem venda na janela.`}>
                              parada <span style={{ opacity: 0.7, fontSize: "0.72rem" }}>({e.vendasPorDia.n} medidos)</span>
                            </span>
                          ) : (
                            <span style={{ opacity: 0.55 }} title="Nenhum produto desta categoria tinha leitura anterior comparável.">
                              sem medição
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>
                          {e.preco.mediana != null ? (
                            <>
                              {moeda(e.preco.p25)}–{moeda(e.preco.p75)}{" "}
                              <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>(med. {moeda(e.preco.mediana)})</span>
                            </>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "0.35rem 0.45rem" }}>{e.lojas}</td>
                        <td style={{ padding: "0.35rem 0.45rem", maxWidth: "16rem" }}>
                          {q?.ok
                            ? QUADRANTES.map((def) => {
                                const ids = q.quadrantes?.[def.id] ?? [];
                                if (ids.length === 0) return null;
                                return (
                                  <Tag key={def.id} kind={def.kind} title={def.ajuda}>
                                    {def.texto} · {ids.length}
                                  </Tag>
                                );
                              })
                            : <span style={{ opacity: 0.55, fontSize: "0.74rem" }} title={q?.motivo ?? ""}>amostra pequena</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Painel>
        ) : null}
      </div>
    </main>
  );
}
