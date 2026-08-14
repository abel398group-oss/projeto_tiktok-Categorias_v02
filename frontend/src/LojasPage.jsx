import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { Painel, Tag } from "./ui.jsx";

/**
 * Lojas — o vendedor por trás do produto.
 *
 * Tudo aqui é agregado dos PRODUTOS de cada loja presentes na base (a coleta
 * não visita o perfil da loja no TikTok, e fingir que sim seria mentir com
 * coluna vazia). Mediana em vez de média; o `n` de cada número visível.
 */

function moeda(n) {
  return typeof n === "number" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

/** Sem acentos e minúsculas, para o filtro achar "intima" em "Íntima". */
function chave(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Sinais da loja — mesmos princípios do ranking: somam contexto, com critério no hover. */
function sinaisDaLoja(l) {
  const sinais = [];
  if ((l.vendasSomadas ?? 0) >= 100000) {
    sinais.push({ kind: "bom", texto: "gigante", ajuda: "100 mil+ vendas somadas nos produtos que temos dela — operação rodada." });
  }
  if (l.notaMediana != null && l.notaMediana >= 4.7 && l.nComNota >= 3) {
    sinais.push({ kind: "bom", texto: "bem avaliada", ajuda: `Nota mediana ${l.notaMediana} em ${l.nComNota} produto(s) — consistência, não sorte de um produto só.` });
  }
  if (l.notaMediana != null && l.notaMediana < 4.3 && l.nComNota >= 3) {
    sinais.push({ kind: "ruim", texto: "nota fraca", ajuda: `Nota mediana ${l.notaMediana} — reclamação e devolução respingam em quem promove.` });
  }
  if ((l.produtosNaBase ?? 0) === 1) {
    sinais.push({ kind: "meio", texto: "1 produto", ajuda: "Só um produto desta loja na base: o agregado é o próprio produto, leia com esse desconto." });
  }
  return sinais;
}

export default function LojasPage() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let ativo = true;
    apiFetch("/analytics/sellers")
      .then((body) => { if (ativo) setDados(body); })
      .catch((e) => { if (ativo) setErro(e?.message ? String(e.message) : "Falha ao carregar."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const lojas = useMemo(() => {
    const todas = Array.isArray(dados?.lojas) ? dados.lojas : [];
    const q = chave(filtro.trim());
    return q ? todas.filter((l) => chave(l.nome).includes(q)) : todas;
  }, [dados, filtro]);

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1>Lojas</h1>
        <p style={{ opacity: 0.8, marginTop: "0.25rem", fontSize: "0.85rem" }}>
          {carregando ? "A carregar…" : `${lojas.length} loja(s) · ${String(dados?.nota ?? "")}`}
        </p>
        {erro ? <p role="alert" style={{ color: "var(--tk-danger, #f85149)" }}>{erro}</p> : null}

        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar pelo nome da loja…"
          aria-label="Filtrar lojas"
          style={{
            width: "100%", maxWidth: "26rem", margin: "0.8rem 0 1rem",
            padding: "0.5rem 0.75rem", fontSize: "0.9rem", borderRadius: 8,
            border: "1px solid var(--tk-border)", background: "var(--tk-bg-elev, transparent)", color: "inherit"
          }}
        />

        {!carregando && !erro ? (
          <Painel
            titulo="Por volume vendido"
            nota="Vendas somadas dos produtos da loja que estão na base — mais produtos coletados, número mais completo. Nota mediana com o tamanho da amostra ao lado."
          >
            <div style={{ overflowX: "auto" }}>
              <table className="tk-analytics-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--tk-border)", textAlign: "left" }}>
                    {["loja", "produtos na base", "vendas somadas", "nota mediana", "preço mediano", "sinais"].map((h) => (
                      <th key={h} style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lojas.slice(0, 100).map((l) => (
                    <tr key={l.sellerId} style={{ borderBottom: "1px solid var(--tk-border)" }}>
                      <td style={{ padding: "0.35rem 0.45rem", maxWidth: "18rem" }}>{l.nome}</td>
                      <td style={{ padding: "0.35rem 0.45rem" }}>{l.produtosNaBase}</td>
                      <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>
                        {typeof l.vendasSomadas === "number" ? l.vendasSomadas.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>
                        {l.notaMediana != null ? (
                          <>
                            {l.notaMediana}{" "}
                            <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>({l.nComNota})</span>
                          </>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.45rem", whiteSpace: "nowrap" }}>{moeda(l.precoMediano)}</td>
                      <td style={{ padding: "0.35rem 0.45rem", maxWidth: "13rem" }}>
                        {sinaisDaLoja(l).map((s) => (
                          <Tag key={s.texto} kind={s.kind} title={s.ajuda}>{s.texto}</Tag>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Painel>
        ) : null}
      </div>
    </main>
  );
}
