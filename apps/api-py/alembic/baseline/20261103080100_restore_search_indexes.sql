-- Oldingi migratsiyada migrate diff trigram indekslarni o'chirib yuborgan (ular sxemada e'lon qilinmagan edi).
-- Endi sxemada e'lon qilingan, bu migratsiya ularni qayta yaratadi.
-- CreateIndex
CREATE INDEX "product_variants_sku_trgm" ON "product_variants" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_name_uz_trgm" ON "products" USING GIN ("name_uz" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_name_ru_trgm" ON "products" USING GIN ("name_ru" gin_trgm_ops);

