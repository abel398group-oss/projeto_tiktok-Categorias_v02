-- AlterTable
ALTER TABLE "products" ADD COLUMN     "enrich_checked_at" TIMESTAMP(3),
ADD COLUMN     "enrich_note" TEXT,
ADD COLUMN     "enrich_status" TEXT;

-- CreateIndex
CREATE INDEX "products_enrich_status_idx" ON "products"("enrich_status");

-- CreateIndex
CREATE INDEX "products_enrich_checked_at_idx" ON "products"("enrich_checked_at");
