-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "attachment_type",
DROP COLUMN "attachment_url",
ADD COLUMN     "attachment_upload_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_attachment_upload_id_key" ON "chat_messages"("attachment_upload_id");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_attachment_upload_id_fkey" FOREIGN KEY ("attachment_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

