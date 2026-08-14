/**
 * TableGrowth.jsx — Aba "Em Ascensão" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import { rowMatchesTicketFilter } from "./ticketLabel.js";
import {
  TicketFilterBar, TicketBadgeCell, ProductLabelsChips,
  IntroCard, introLead, introWarn,
  asArray, isInteractiveTableCellClick
} from "./tableShared.jsx";

const GROWTH_EMPTY_MSG =
  "Ainda não há dados suficientes para calcular crescimento. Rode pelo menos duas coletas/importações comparáveis.";

export default function TableGrowth({ data }) {
  const navigate = useNavigate();
  const allRows = asArray(data?.items);
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

  const growthRowsTicket = useMemo(
    () => allRows.filter((r) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (r))),
    [allRows, ticketTier]
  );

  const growthIntro = (
    <IntroCard title="Em Ascensão">
      <p style={introLead}>
        <strong>Variação de vendas</strong> entre o <strong>último</strong> e o <strong>penúltimo</strong> import na base — o
        servidor compara pares de snapshots com vendas registadas e ordena por maior <strong>delta</strong>.
      </p>
      <p style={{ ...introLead, marginTop: "0.35rem", fontSize: "0.82rem", opacity: 0.9 }}>
        <strong>Workspace:</strong> clique em qualquer ponto da linha (excepto o link) para abrir <code>/produto/…</code> quando houver <code>productId</code>.
      </p>
      <div style={introWarn}>Métricas derivadas dos imports — não são números em tempo real do TikTok.</div>
    </IntroCard>
  );

  if (data == null) {
    return (
      <>
        {growthIntro}
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

  if (allRows.length === 0) {
    return (
      <>
        {growthIntro}
        <p style={{ opacity: 0.9, marginBottom: "0.45rem", maxWidth: "42rem", lineHeight: 1.5 }}>{GROWTH_EMPTY_MSG}</p>
        {data.message ? (<p style={{ fontSize: "0.8rem", opacity: 0.72, maxWidth: "42rem" }}>{String(data.message)}</p>) : null}
      </>
    );
  }

  return (
    <>
      {growthIntro}
      {data.latestRun && data.previousRun ? (
        <p style={{ fontSize: "0.74rem", opacity: 0.78, marginBottom: "0.5rem" }}>
          Runs: último <code>{String((/** @type {any} */ (data.latestRun)).id ?? "")}</code> vs anterior{" "}
          <code>{String((/** @type {any} */ (data.previousRun)).id ?? "")}</code>
          {data.sortNote ? (<>{" "}· {String(data.sortNote)}</>) : null}
        </p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>Após filtro Ticket: <strong>{growthRowsTicket.length}</strong> de {allRows.length} linha(s).</p>
      ) : null}
      <table className="tk-analytics-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--tk-border)", textAlign: "left" }}>
            {["#", "nome", "loja", "preço", "Ticket", "vendas ant.", "vendas atual", "delta", "% cresc.", "link"].map((h) => (
              <th key={h} style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {growthRowsTicket.map((raw, i) => {
            const row = /** @type {Record<string, unknown>} */ (raw);
            const preco = row.preco;
            const precoStr = preco != null && Number.isFinite(Number(preco))
              ? Number(preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : preco != null && String(preco).trim() !== "" ? String(preco) : "—";
            const link = row.link != null ? String(row.link) : "";
            const key = row.productId != null ? String(row.productId) : link || `g-${i}`;
            const pid = row.productId != null ? String(row.productId).trim() : "";
            return (
              <tr key={key}
                className={pid ? "tk-row-clickable" : undefined}
                style={{ borderBottom: "1px solid var(--tk-border)", cursor: pid ? "pointer" : "default" }}
                title={pid ? "Clique na linha para abrir o workspace" : undefined}
                onClick={(e) => { if (isInteractiveTableCellClick(e) || !pid) return; void navigate(`/produto/${encodeURIComponent(pid)}`); }}>
                <td style={{ padding: "0.35rem 0.45rem", opacity: 0.85 }}>{i + 1}</td>
                <td style={{ padding: "0.35rem 0.45rem", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                    <span>{row.nome != null ? String(row.nome) : "—"}</span>
                    <ProductLabelsChips row={row} />
                  </div>
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.loja != null ? String(row.loja) : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{precoStr}</td>
                <TicketBadgeCell row={row} tdExtra={{ padding: "0.35rem 0.45rem" }} />
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.vendasAnt != null ? Number(row.vendasAnt).toLocaleString("pt-BR") : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.vendasAtual != null ? (<span className="tk-metric">{Number(row.vendasAtual).toLocaleString("pt-BR")}</span>) : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.delta != null ? (<span className="tk-metric">{Number(row.delta).toLocaleString("pt-BR")}</span>) : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.deltaPct != null && String(row.deltaPct).trim() !== "" ? String(row.deltaPct) : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{link ? (<a href={link} target="_blank" rel="noopener noreferrer" className="tk-link-external">Abrir no TikTok</a>) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
