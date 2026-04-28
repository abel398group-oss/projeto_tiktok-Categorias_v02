-- AlterTable
ALTER TABLE "scrape_runs" ADD COLUMN "input_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "scrape_runs_input_hash_key" ON "scrape_runs"("input_hash");
