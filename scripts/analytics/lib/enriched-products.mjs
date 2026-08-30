/**
 * Produtos com galeria — a lista de onde a ponte de vídeo tira candidatos.
 *
 * POR QUE ISTO EXISTE, e não se resolve com `/analytics/top-products`:
 *
 * `top-products` responde sobre a ÚLTIMA coleta. Mas o enriquecimento (a
 * visita à PDP que traz as 10-20 fotos) é caro e acontece uma vez por produto,
 * numa coleta qualquer. Quando a coleta seguinte roda, o produto enriquecido
 * na semana passada pode nem aparecer nela — e some da vista, apesar de o
 * banco ainda ter as fotos todas.
 *
 * Foi exactamente isso que travou a ponte: 8 produtos enriquecidos no banco,
 * 3 deles com galeria boa, e a ponte a dizer "0 produtos prontos" porque olhava
 * só para o ficheiro da última coleta.
 *
 * A regra aqui é a mesma do resto do relatório: o banco lembra, o ficheiro
 * esquece — quando os dois discordam, ganha o banco.
 */

/** Só URL http conta como foto; o resto é placeholder ou lixo do payload. */
function fotosUteis(pdpImages) {
  if (!Array.isArray(pdpImages)) return 0;
  return pdpImages.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)).length;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ minFotos?: number, limit?: number }} [opcoes]
 */
export async function listEnrichedProducts(prisma, opcoes = {}) {
  const minFotos = Number.isFinite(opcoes.minFotos) ? Math.max(1, opcoes.minFotos) : 3;
  const limit = Number.isFinite(opcoes.limit) ? Math.min(Math.max(1, opcoes.limit), 500) : 200;

  const produtos = await prisma.product.findMany({
    where: { enrichStatus: "ok", hiddenAt: null },
    select: {
      productId: true,
      name: true,
      productUrl: true,
      categoryUrl: true,
      currency: true,
      seller: { select: { name: true } },
      /*
       * Vários snapshots, não só o último: uma re-coleta de categoria grava um
       * snapshot novo SEM galeria (a listagem só traz a miniatura), o que
       * empurraria a galeria real para trás. Pegamos o snapshot mais recente
       * que ainda tem fotos, e dizemos quando foi — o mesmo remendo que
       * `product-workspace` faz para a galeria da UI.
       */
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 30,
        select: {
          capturedAt: true,
          price: true,
          salesCount: true,
          ratingAverage: true,
          ratingTotal: true,
          pdpImages: true
        }
      }
    },
    take: 500
  });

  const itens = [];
  for (const p of produtos) {
    const snaps = p.snapshots ?? [];
    if (snaps.length === 0) continue;
    const comGaleria = snaps.find((s) => fotosUteis(s.pdpImages) >= minFotos);
    if (!comGaleria) continue;

    // Preço/vendas vêm do snapshot MAIS RECENTE (é o estado actual); as fotos
    // vêm do snapshot que as tem. Misturar é de propósito, e por isso as datas
    // das duas coisas viajam na resposta.
    const atual = snaps[0];
    itens.push({
      productId: p.productId,
      nome: p.name ?? "—",
      loja: p.seller?.name ?? "—",
      link: p.productUrl ?? "",
      categoryUrl: p.categoryUrl ?? "",
      moeda: p.currency ?? "BRL",
      preco: atual.price ?? null,
      vendas: atual.salesCount ?? null,
      avaliacao_media: atual.ratingAverage ?? null,
      avaliacoes_total: atual.ratingTotal ?? null,
      fotos: fotosUteis(comGaleria.pdpImages),
      medidoEm: atual.capturedAt.toISOString(),
      fotosCapturadasEm: comGaleria.capturedAt.toISOString(),
      fotosDeOutroRun: comGaleria !== atual
    });
  }

  itens.sort((a, b) => (b.vendas ?? 0) - (a.vendas ?? 0));
  return {
    minFotos,
    totalEnriquecidos: produtos.length,
    comGaleria: itens.length,
    itens: itens.slice(0, limit)
  };
}
