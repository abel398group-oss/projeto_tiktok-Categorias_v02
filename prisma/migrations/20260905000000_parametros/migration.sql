-- Cortes do score editáveis sem deploy.
--
-- Esparsa de propósito: só as chaves que alguém MUDOU são gravadas. O
-- catálogo com o valor por omissão, a unidade, a descrição e a fonte vive
-- em scripts/analytics/lib/score-parametros.mjs, versionado — uma linha
-- aqui é uma decisão de operação, não a definição do parâmetro.
--
-- Consequência prática: apagar uma linha volta ao padrão do código, e uma
-- base vazia comporta-se exactamente como antes desta migração.
CREATE TABLE "parametros" (
    "chave" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_pkey" PRIMARY KEY ("chave")
);
