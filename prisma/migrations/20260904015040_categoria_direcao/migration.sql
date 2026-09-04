-- CreateTable
CREATE TABLE "categoria_direcao" (
    "chave" TEXT NOT NULL,
    "prioridade" INTEGER NOT NULL,
    "nota" TEXT NOT NULL,
    "definida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categoria_direcao_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "categoria_direcao_prioridade_idx" ON "categoria_direcao"("prioridade");
