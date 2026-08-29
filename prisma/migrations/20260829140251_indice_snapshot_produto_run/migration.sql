-- CreateIndex
CREATE INDEX "product_snapshots_product_ref_id_scrape_run_id_idx" ON "product_snapshots"("product_ref_id", "scrape_run_id");
