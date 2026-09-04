/**
 * Regras do TikTok Shop que o pacote consegue verificar antes de publicar.
 *
 * Porto em JS do `app/services/politica_tiktok.py` do MoneyPrinterTurbo. As
 * regras são as mesmas e as fontes também — o que muda é onde vivem: o Money
 * saiu do fluxo (a política dele proíbe o formato que ele gerava), mas a
 * verificação da LEGENDA continua a valer, porque a legenda continua a ser
 * escrita por nós.
 *
 * Consultado em 30/08/2026:
 *   · Requirements for Responsible Health-Related Content (BR)
 *     seller-br.tiktok.com/university/essay?knowledge_id=3537527768876817
 *   · Requirements for High-Quality Videos and LIVEs
 *     seller-us.tiktok.com/university/essay?knowledge_id=4581457528243969
 *   · Affiliate Marketing / Intellectual Property Policy
 *
 * AVISA, NÃO BLOQUEIA. Bloquear daria falso positivo em produto legítimo
 * ("desengordurante que elimina gordura da cozinha"), e um bloqueio que se
 * aprende a ignorar deixa de proteger.
 */

/*
 * A narração e o vídeo saem do Symphony, que rotula sozinho como IA. Mas o
 * rótulo de conteúdo comercial é escolha de quem publica, e nada o põe
 * automaticamente — por isso o aviso é incondicional.
 */
export const AVISO_IA =
  "ATIVE o rótulo de conteúdo gerado por IA ao publicar.\n" +
  "  O Symphony já marca o ficheiro, mas confirme no momento de publicar.";

export const AVISO_COMERCIAL =
  "ATIVE a divulgação de conteúdo comercial (botão de conteúdo pago/afiliado).\n" +
  "  Obrigatório em qualquer vídeo que promova produto com link.";

export const AVISO_LIMITE_DE_CONTA =
  "Abaixo de 5.000 seguidores o TikTok limita a 3 vídeos com produto por dia,\n" +
  "  e só deixa promover produtos com Shop Performance Score de 95% ou mais.";

/** `[rótulo, padrão, porquê]` — corre sobre roteiro E legenda. */
export const REGRAS = [
  [
    "cura/tratamento",
    /\b(cura|curar|trata|tratar|previne|prevenir|combate|elimina)\s+(a|o|as|os)?\s*\w*(doenc|cancer|diabet|depress|ansiedad|insonia|artrite|colesterol)/i,
    "Alegação terapêutica. A política de saúde proíbe dizer que o produto trata, cura ou previne uma condição."
  ],
  [
    "emagrecimento",
    /\b(emagrec|perde[r]?\s+peso|queima\s+(de\s+)?gordura|secar?\s+(a\s+)?barriga|perder\s+\d+\s*(kg|quilos)|deficit\s+calorico|afina\s+a\s+cintura)/i,
    "Alegação de perda de peso. Proibida no BR, incluindo linguagem codificada."
  ],
  [
    "ganho de massa",
    /\b(ganho\s+de\s+(massa|peso)|hipertrofia|ganhar\s+musculo|aumenta[r]?\s+massa\s+muscular)/i,
    "Produto ou alegação de ganho de peso/massa é proibido."
  ],
  [
    "resultado rapido",
    /\b(em\s+\d+\s*(dias?|semanas?)\s+voce|resultado\s+(imediato|garantido)|em\s+apenas\s+\d+\s*(dias?|semanas?))/i,
    "Promessa de resultado rápido ou garantido."
  ],
  [
    "endosso medico",
    /\b(medicos?\s+(recomendam|indicam|nao\s+querem)|aprovado\s+por\s+medicos?|receitado|prescrito|dermatologicamente\s+comprovado)/i,
    "Texto ou imagem que sugere endosso profissional."
  ],
  [
    "antes e depois",
    /\b(antes\s+e\s+depois|antes\s*\/\s*depois|transformacao\s+(do\s+)?corpo)/i,
    "Antes-e-depois é proibido para saúde e bem-estar."
  ],
  [
    "GLP",
    /\bGLP[\s-]?\d?\b/i,
    "Produtos com 'GLP' no nome ou na alegação são totalmente proibidos."
  ]
];

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Alegações problemáticas num texto.
 * @param {unknown} texto
 * @returns {Array<{ regra: string, trecho: string, porQue: string }>}
 */
export function verificarTexto(texto) {
  const alvo = semAcento(texto);
  const achados = [];
  for (const [regra, padrao, porQue] of REGRAS) {
    const m = alvo.match(padrao);
    if (m) {
      const i = Math.max(0, (m.index ?? 0) - 25);
      achados.push({ regra, trecho: alvo.slice(i, (m.index ?? 0) + m[0].length + 25).trim(), porQue });
    }
  }
  return achados;
}

/** Categorias restritas no BR: avisar, não bloquear. */
export const PALAVRAS_SENSIVEIS = [
  "suplemento", "vitamina", "magnesio", "colageno", "whey", "creatina",
  "emagrec", "detox", "termogenico", "capsula", "medicamento", "farmac", "anvisa"
];

/** @returns {string | null} a palavra que disparou */
export function categoriaSensivel(...textos) {
  const junto = semAcento(textos.join(" ")).toLowerCase();
  return PALAVRAS_SENSIVEIS.find((p) => junto.includes(p)) ?? null;
}

/**
 * O bloco que acompanha o pacote — vai no mesmo ficheiro da legenda, de
 * propósito: é o que se abre na hora de publicar. Aviso noutro sítio não é lido.
 */
export function blocoDeConformidade({ roteiro = "", legenda = "", nomeProduto = "", usouFotosDeClientes = false } = {}) {
  const linhas = ["--- ANTES DE PUBLICAR ---", "", AVISO_IA, "", AVISO_COMERCIAL];

  if (usouFotosDeClientes) {
    linhas.push(
      "",
      "REVEJA: usa fotos de avaliações de clientes.\n" +
      "  A política de propriedade intelectual exige autorização do titular\n" +
      "  para reutilizar foto de outra pessoa. Comprar o produto não dá\n" +
      "  direito sobre a foto de quem o comprou."
    );
  }

  const termo = categoriaSensivel(nomeProduto, roteiro, legenda);
  if (termo) {
    linhas.push(
      "",
      `ATENÇÃO: produto de saúde ou suplemento (disparou por '${termo}').\n` +
      "  No Brasil é categoria restrita e as alegações são filtradas de perto.\n" +
      "  PODE falar de bem-estar geral: energia, imunidade, pele, sono.\n" +
      "  NÃO PODE dizer que trata, cura ou previne nada, nem falar de peso."
    );
  }

  const achados = verificarTexto(`${roteiro}\n${legenda}`);
  if (achados.length > 0) {
    linhas.push("", "ALEGAÇÕES A REVER:");
    for (const a of achados) {
      linhas.push(`  [${a.regra}] …${a.trecho}…`, `      ${a.porQue}`);
    }
  }

  linhas.push("", AVISO_LIMITE_DE_CONTA);
  return linhas.join("\n");
}
