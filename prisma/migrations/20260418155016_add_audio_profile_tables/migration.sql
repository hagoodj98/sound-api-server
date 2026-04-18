-- CreateTable
CREATE TABLE "AudioFile" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundProfile" (
    "id" SERIAL NOT NULL,
    "audioFileId" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "tempoBpm" DOUBLE PRECISION NOT NULL,
    "estimatedPitchHz" DOUBLE PRECISION NOT NULL,
    "rmsMean" DOUBLE PRECISION NOT NULL,
    "spectralCentroidMean" DOUBLE PRECISION NOT NULL,
    "spectralRolloffMean" DOUBLE PRECISION NOT NULL,
    "spectralBandwidthMean" DOUBLE PRECISION NOT NULL,
    "zeroCrossingRateMean" DOUBLE PRECISION NOT NULL,
    "mfccMean" JSONB NOT NULL,
    "mfccStd" JSONB NOT NULL,
    "chromaMean" JSONB NOT NULL,
    "rawAnalysis" JSONB NOT NULL,

    CONSTRAINT "SoundProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoundProfile_audioFileId_key" ON "SoundProfile"("audioFileId");

-- AddForeignKey
ALTER TABLE "SoundProfile" ADD CONSTRAINT "SoundProfile_audioFileId_fkey" FOREIGN KEY ("audioFileId") REFERENCES "AudioFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
