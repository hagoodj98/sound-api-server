/*
  Warnings:

  - A unique constraint covering the columns `[storageKey]` on the table `AudioFile` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AudioFile_storageKey_key" ON "AudioFile"("storageKey");
