-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hidden_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "products_hidden_at_idx" ON "products"("hidden_at");
