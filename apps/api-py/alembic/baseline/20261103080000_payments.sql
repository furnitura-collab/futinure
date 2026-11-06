-- DropIndex
DROP INDEX "product_variants_sku_trgm";

-- DropIndex
DROP INDEX "products_name_ru_trgm";

-- DropIndex
DROP INDEX "products_name_uz_trgm";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "receipt_url",
ADD COLUMN     "receipt_upload_id" UUID;

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploads_owner_id_created_at_idx" ON "uploads"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_upload_id_key" ON "payments"("receipt_upload_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_upload_id_fkey" FOREIGN KEY ("receipt_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

