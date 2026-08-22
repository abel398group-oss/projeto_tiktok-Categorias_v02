/**
 * Busca global: uma caixa, resultados agrupados (produtos e lojas).
 *
 * Motivo de existir: com ~20 mil produtos na base, achar "aquele body que vi
 * ontem" exigia abrir o ranking e rolar — não havia busca nenhuma no painel.
 * O modelo é a busca federada do product-seeker: um pedido, grupos separados
 * na resposta, cada grupo com o seu limite.
 *
 * As categorias ficam de fora DESTE endpoint de propósito: a lista importada
 * já chega ao painel por /analytics/categories e é filtrada no cliente com a
 * mesma lógica de slug/rótulo das páginas — duplicá-la aqui criaria uma
 * segunda fonte de verdade para o link de categoria.
 */

/** Limites por grupo: busca é para achar, não para paginar. */
export const LIMITE_PRODUTOS = 12;
export const LIMITE_LOJAS = 8;

/** Query aceitável: 2+ caracteres depois de aparar. */
export function normalizarQuery(bruta) {
  const q = typeof bruta === "string" ? bruta.trim() : "";
  return q.length >= 2 ? q : "";
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} qBruta
 */
export async function buscarTudo(prisma, qBruta) {
  const q = normalizarQuery(qBruta);
  if (!q) {
    return { q: "", produtos: [], lojas: [], message: "Escreva pelo menos 2 caracteres." };
  }

  // Colar um productId inteiro na caixa é atalho legítimo: bate por igualdade.
  const pareceId = /^\d{6,}$/.test(q);

  const [produtos, lojas] = await Promise.all([
    prisma.product.findMany({
      where: {
        hiddenAt: null,
        ...(pareceId ? { productId: q } : { name: { contains: q, mode: "insensitive" } })
      },
      take: LIMITE_PRODUTOS,
      orderBy: { lastSeenAt: "desc" },
      include: {
        seller: { select: { name: true } },
        // Só o snapshot mais recente: a busca mostra o estado atual, não o histórico.
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { price: true, salesCount: true, ratingAverage: true, capturedAt: true }
        }
      }
    }),
    prisma.seller.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: LIMITE_LOJAS,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { products: true } } }
    })
  ]);

  return {
    q,
    produtos: produtos.map((p) => {
      const s = p.snapshots[0] ?? null;
      return {
        productId: p.productId,
        nome: p.name ?? "—",
        loja: p.seller?.name ?? "—",
        link: p.productUrl ?? "",
        categoryUrl: p.categoryUrl ?? "",
        preco: s?.price ?? null,
        vendas: s?.salesCount ?? null,
        rating: s?.ratingAverage ?? null,
        vistoEm: s?.capturedAt ?? p.lastSeenAt ?? null
      };
    }),
    lojas: lojas.map((l) => ({
      sellerId: l.sellerId,
      nome: l.name ?? "—",
      produtosNaBase: l._count.products
    }))
  };
}
