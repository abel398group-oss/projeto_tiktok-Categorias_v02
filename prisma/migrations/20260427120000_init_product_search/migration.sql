-- CreateTable
CREATE TABLE "scrape_runs" (
    "id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "source_platform" TEXT NOT NULL DEFAULT 'tiktok_shop',
    "status" TEXT NOT NULL,
    "category_url" TEXT,
    "final_url" TEXT,
    "total_products" INTEGER,
    "filter_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "global_seller_id" TEXT,
    "name" TEXT,
    "logo_uri" TEXT,
    "logo_urls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "source_platform" TEXT NOT NULL DEFAULT 'tiktok_shop',
    "name" TEXT,
    "product_url" TEXT,
    "category_url" TEXT,
    "currency" TEXT,
    "seller_ref_id" TEXT,
    "first_seen_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_snapshots" (
    "id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "original_price" DOUBLE PRECISION,
    "has_discount" BOOLEAN NOT NULL DEFAULT false,
    "estimated_showcase_price" DOUBLE PRECISION,
    "estimated_price_gap" DOUBLE PRECISION,
    "estimated_price_gap_percent" DOUBLE PRECISION,
    "sales_count" INTEGER,
    "sales_text" TEXT,
    "rating_average" DOUBLE PRECISION,
    "rating_total" INTEGER,
    "votes_by_star" JSONB,
    "images" JSONB,
    "pdp_images" JSONB,
    "data_quality" JSONB,
    "product_ref_id" TEXT NOT NULL,
    "scrape_run_id" TEXT NOT NULL,

    CONSTRAINT "product_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_snapshots" (
    "id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "total_sales" INTEGER,
    "active_products" INTEGER,
    "total_reviews" INTEGER,
    "followers" INTEGER,
    "videos" INTEGER,
    "enable_follow" BOOLEAN,
    "data_quality" JSONB,
    "seller_ref_id" TEXT NOT NULL,
    "scrape_run_id" TEXT NOT NULL,

    CONSTRAINT "seller_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_payloads" (
    "id" TEXT NOT NULL,
    "payload_type" TEXT NOT NULL,
    "storage_kind" TEXT NOT NULL,
    "storage_path" TEXT,
    "payload_json" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "scrape_run_id" TEXT NOT NULL,
    "product_ref_id" TEXT,
    "seller_ref_id" TEXT,

    CONSTRAINT "raw_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sellers_seller_id_key" ON "sellers"("seller_id");

-- CreateIndex
CREATE INDEX "sellers_seller_id_idx" ON "sellers"("seller_id");

-- CreateIndex
CREATE INDEX "sellers_name_idx" ON "sellers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_id_key" ON "products"("product_id");

-- CreateIndex
CREATE INDEX "products_product_id_idx" ON "products"("product_id");

-- CreateIndex
CREATE INDEX "products_seller_ref_id_idx" ON "products"("seller_ref_id");

-- CreateIndex
CREATE INDEX "products_category_url_idx" ON "products"("category_url");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "product_snapshots_product_ref_id_captured_at_idx" ON "product_snapshots"("product_ref_id", "captured_at");

-- CreateIndex
CREATE INDEX "product_snapshots_scrape_run_id_idx" ON "product_snapshots"("scrape_run_id");

-- CreateIndex
CREATE INDEX "product_snapshots_sales_count_idx" ON "product_snapshots"("sales_count");

-- CreateIndex
CREATE INDEX "product_snapshots_price_idx" ON "product_snapshots"("price");

-- CreateIndex
CREATE INDEX "product_snapshots_rating_average_idx" ON "product_snapshots"("rating_average");

-- CreateIndex
CREATE INDEX "seller_snapshots_seller_ref_id_captured_at_idx" ON "seller_snapshots"("seller_ref_id", "captured_at");

-- CreateIndex
CREATE INDEX "seller_snapshots_scrape_run_id_idx" ON "seller_snapshots"("scrape_run_id");

-- CreateIndex
CREATE INDEX "raw_payloads_scrape_run_id_idx" ON "raw_payloads"("scrape_run_id");

-- CreateIndex
CREATE INDEX "raw_payloads_product_ref_id_idx" ON "raw_payloads"("product_ref_id");

-- CreateIndex
CREATE INDEX "raw_payloads_seller_ref_id_idx" ON "raw_payloads"("seller_ref_id");

-- CreateIndex
CREATE INDEX "raw_payloads_payload_type_idx" ON "raw_payloads"("payload_type");

-- CreateIndex
CREATE INDEX "raw_payloads_captured_at_idx" ON "raw_payloads"("captured_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_seller_ref_id_fkey" FOREIGN KEY ("seller_ref_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_scrape_run_id_fkey" FOREIGN KEY ("scrape_run_id") REFERENCES "scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_snapshots" ADD CONSTRAINT "seller_snapshots_seller_ref_id_fkey" FOREIGN KEY ("seller_ref_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_snapshots" ADD CONSTRAINT "seller_snapshots_scrape_run_id_fkey" FOREIGN KEY ("scrape_run_id") REFERENCES "scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_scrape_run_id_fkey" FOREIGN KEY ("scrape_run_id") REFERENCES "scrape_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_product_ref_id_fkey" FOREIGN KEY ("product_ref_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_seller_ref_id_fkey" FOREIGN KEY ("seller_ref_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
