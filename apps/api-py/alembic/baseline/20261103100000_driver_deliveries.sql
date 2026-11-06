-- AlterTable
ALTER TABLE "deliveries" DROP COLUMN "proof_photo_url",
ADD COLUMN     "assigned_by" UUID,
ADD COLUMN     "cash_collected" BIGINT,
ADD COLUMN     "proof_upload_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_proof_upload_id_key" ON "deliveries"("proof_upload_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_proof_upload_id_fkey" FOREIGN KEY ("proof_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

