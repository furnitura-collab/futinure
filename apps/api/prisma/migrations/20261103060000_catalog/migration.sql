-- AlterTable
ALTER TABLE "products" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");


-- ───── Qidiruv: trigram (xatoga chidamli, ILIKE '%...%' ni tezlashtiradi) ─────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_name_uz_trgm" ON "products" USING GIN ("name_uz" gin_trgm_ops);
CREATE INDEX "products_name_ru_trgm" ON "products" USING GIN ("name_ru" gin_trgm_ops);
CREATE INDEX "product_variants_sku_trgm" ON "product_variants" USING GIN ("sku" gin_trgm_ops);

-- ADJUST inventarizatsiya farqi manfiy bo'lishi mumkin
ALTER TABLE "stock_movements" DROP CONSTRAINT "movement_qty_positive";
ALTER TABLE "stock_movements" ADD CONSTRAINT "movement_qty_sign"
  CHECK (("type" = 'ADJUST' AND "qty" <> 0) OR ("type" <> 'ADJUST' AND "qty" > 0));
