-- CreateTable
CREATE TABLE "product_curation" (
    "product_id" TEXT NOT NULL,
    "rotulo" TEXT,
    "gastar_credito" BOOLEAN,
    "nota" TEXT,
    "curado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_curation_pkey" PRIMARY KEY ("product_id")
);

-- CreateIndex
CREATE INDEX "product_curation_gastar_credito_idx" ON "product_curation"("gastar_credito");
