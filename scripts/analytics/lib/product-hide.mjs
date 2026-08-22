/**
 * Ocultar/reexibir produto — SOFT-HIDE, nunca DELETE.
 *
 * Um Product tem ProductSnapshot pendurado (histórico de preço/vendas por
 * coleta) — apagar o Product de verdade apaga dias de coleta com ele. Isto
 * só marca `hiddenAt`: o produto some do ranking/busca, mas o dado continua
 * no banco, e reaparece se alguém desmarcar. Reversível de propósito.
 */

const isDigits = (s) => typeof s === "string" && /^\d+$/.test(s);

/** @param {import("@prisma/client").PrismaClient} prisma @param {string} productId */
export async function hideProduct(prisma, productId) {
  const id = String(productId ?? "").trim();
  if (!isDigits(id)) return { ok: false, error: "bad_request", message: "productId deve conter apenas dígitos." };

  const found = await prisma.product.findUnique({ where: { productId: id }, select: { id: true, hiddenAt: true } });
  if (!found) return { ok: false, error: "not_found", message: `Produto ${id} não encontrado.` };

  const jaOculto = found.hiddenAt != null;
  if (!jaOculto) {
    await prisma.product.update({ where: { productId: id }, data: { hiddenAt: new Date() } });
  }
  return { ok: true, productId: id, hiddenAt: jaOculto ? found.hiddenAt.toISOString() : new Date().toISOString(), alreadyHidden: jaOculto };
}

/** @param {import("@prisma/client").PrismaClient} prisma @param {string} productId */
export async function unhideProduct(prisma, productId) {
  const id = String(productId ?? "").trim();
  if (!isDigits(id)) return { ok: false, error: "bad_request", message: "productId deve conter apenas dígitos." };

  const found = await prisma.product.findUnique({ where: { productId: id }, select: { id: true, hiddenAt: true } });
  if (!found) return { ok: false, error: "not_found", message: `Produto ${id} não encontrado.` };

  if (found.hiddenAt != null) {
    await prisma.product.update({ where: { productId: id }, data: { hiddenAt: null } });
  }
  return { ok: true, productId: id, hiddenAt: null };
}

/**
 * Oculta vários de uma vez. Não falha o lote inteiro por causa de um id ruim —
 * cada produto tem o seu resultado próprio, quem chama decide o que fazer com
 * os que falharam.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {unknown} productIdsRaw
 */
export async function hideProductsBatch(prisma, productIdsRaw) {
  const ids = Array.isArray(productIdsRaw)
    ? [...new Set(productIdsRaw.map((v) => String(v ?? "").trim()).filter(isDigits))]
    : [];
  if (ids.length === 0) {
    return { ok: false, error: "bad_request", message: "productIds deve ser uma lista de ids numéricos." };
  }

  const resultado = await prisma.product.updateMany({
    where: { productId: { in: ids }, hiddenAt: null },
    data: { hiddenAt: new Date() }
  });

  const existentes = await prisma.product.count({ where: { productId: { in: ids } } });

  return {
    ok: true,
    pedidos: ids.length,
    ocultadosAgora: resultado.count,
    // ids pedidos que nem existem na base — não é erro, mas é informação útil.
    naoEncontrados: ids.length - existentes
  };
}

/**
 * Produtos atualmente ocultos — para a UI de "restaurar".
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function listHiddenProducts(prisma) {
  const produtos = await prisma.product.findMany({
    where: { hiddenAt: { not: null } },
    orderBy: { hiddenAt: "desc" },
    take: 500,
    select: {
      productId: true,
      name: true,
      hiddenAt: true,
      categoryUrl: true,
      seller: { select: { name: true } }
    }
  });
  return {
    total: produtos.length,
    itens: produtos.map((p) => ({
      productId: p.productId,
      nome: p.name ?? "—",
      loja: p.seller?.name ?? "—",
      categoryUrl: p.categoryUrl ?? "",
      ocultoEm: p.hiddenAt.toISOString()
    }))
  };
}
