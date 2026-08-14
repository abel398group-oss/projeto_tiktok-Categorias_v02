/**
 * Relatório de lojas — o vendedor por trás do produto.
 *
 * Por que importa para afiliado: promover produto de loja moribunda é herdar a
 * reclamação dela.
 *
 * Decisão de honestidade (medida em 08/08/2026): o schema tem campos de perfil
 * de loja (seguidores, vendas totais, produtos ativos) mas ZERO de 240 mil
 * snapshots os têm preenchidos — a coleta de categoria não visita a página da
 * loja, e esses dados só existem lá. Uma tabela dessas colunas seria uma tela
 * de nulos fingindo relatório. O que EXISTE de verdade é o agregado dos
 * produtos de cada loja na base — vendas somadas, nota mediana, preço mediano —
 * e é isso que este relatório entrega, com o nome certo: "dos produtos na
 * base", nunca "da loja inteira".
 */
import { Prisma } from "@prisma/client";

export const LIMITE_LOJAS = 300;

/**
 * Agregados por loja a partir do último snapshot de cada produto dela.
 *
 * SQL cru numa volta só: DISTINCT ON pega a leitura mais recente de cada
 * produto; o GROUP BY por loja agrega com mediana (percentile_cont), nunca
 * média — uma loja com um produto viral e nove parados não é "loja média".
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getSellersReport(prisma) {
  const rows = /** @type {Array<Record<string, unknown>>} */ (
    await prisma.$queryRaw(Prisma.sql`
WITH ult_prod AS (
  SELECT DISTINCT ON (ps.product_ref_id)
    ps.product_ref_id,
    ps.sales_count,
    ps.rating_average,
    ps.price,
    ps.captured_at,
    p.seller_ref_id
  FROM product_snapshots ps
  JOIN products p ON p.id = ps.product_ref_id
  WHERE p.seller_ref_id IS NOT NULL
  ORDER BY ps.product_ref_id, ps.captured_at DESC
)
SELECT
  s.seller_id,
  s.name,
  COUNT(*)::int                                                        AS produtos_na_base,
  SUM(up.sales_count)::bigint                                          AS vendas_somadas,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY up.rating_average)       AS nota_mediana,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY up.price)                AS preco_mediano,
  COUNT(*) FILTER (WHERE up.rating_average IS NOT NULL)::int           AS n_com_nota,
  MAX(up.captured_at)                                                  AS medido_em
FROM ult_prod up
JOIN sellers s ON s.id = up.seller_ref_id
GROUP BY s.id, s.seller_id, s.name
ORDER BY vendas_somadas DESC NULLS LAST
LIMIT ${LIMITE_LOJAS}
`)
  );

  const num = (v) => (v == null ? null : Number(v));
  const arred = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);
  return {
    total: rows.length,
    maxListado: LIMITE_LOJAS,
    nota:
      "Números agregados dos PRODUTOS de cada loja presentes na base — não do perfil " +
      "completo da loja no TikTok (esse a coleta não visita). Mediana, nunca média.",
    lojas: rows.map((r) => ({
      sellerId: String(r.seller_id ?? ""),
      nome: r.name != null ? String(r.name) : "—",
      produtosNaBase: num(r.produtos_na_base) ?? 0,
      vendasSomadas: num(r.vendas_somadas),
      notaMediana: arred(r.nota_mediana),
      nComNota: num(r.n_com_nota) ?? 0,
      precoMediano: arred(r.preco_mediano),
      medidoEm: r.medido_em instanceof Date ? r.medido_em.toISOString() : r.medido_em ?? null
    }))
  };
}
