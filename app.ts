import cors from "cors";
import express from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { s3Client } from "./lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./lib/database";
import { analyzeAudio } from "./pythonScript";

// Define TypeScript types for the audio analysis results and sound profile data structure
type DNA = {
  mfccMean: number[];
  mfccStd: number[];
  chromaMean: number[];
  spectralCentroidMean: number;
  spectralBandwidthMean: number;
  spectralRolloffMean: number;
  zeroCrossingRateMean: number;
  rmsMean: number;
};
// Define the structure of the audio analysis results returned by the Python script
type AudioAnalysisResult = {
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  tempoBpm: number;
  estimatedPitchHz: number;
  dna: DNA;
};

export const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  console.log(req.url);

  res.send("Hello, Sound DNA API!");
});
const temptStorage = multer.memoryStorage(); // Use memory storage for multer to store uploaded files in memory
const upload = multer({ storage: temptStorage }); // Create a multer instance with the memory storage configuration
app.post("/api/submit-audio", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file; // Get the uploaded audio file from the request
    if (!audioFile) {
      return res.status(400).json({ message: "No audio file uploaded." }); // Respond with an error if no audio file was uploaded
    }
    const creationTime = new Date().toISOString(); // Get the current timestamp to create a unique reference key for the audio file
    const audioReferenceKey = `audio/${creationTime}-${audioFile.originalname}`; // Create a unique reference key for the audio file to be stored in Cloudflare R2

    // Upload the audio file to Cloudflare R2 using the S3 client
    await s3Client.send(
      // Create a PutObjectCommand to upload the audio file to the specified bucket and key in Cloudflare R2
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, // Use the Cloudflare R2 bucket name from environment variables
        Key: audioReferenceKey, // Set a unique key for the audio file in the bucket
        Body: audioFile.buffer, // Use the buffer of the uploaded audio file as the body of the S3 object
        ContentType: audioFile.mimetype, // Set the content type of the S3 object to the MIME type of the uploaded audio file
      }),
    );

    //once the file is uploaded to R2 and the metadata is stored in the database, you can implement any additional logic here, such as processing the audio file using the SOUND DNA API
    // For example, you can call the analyzeAudio function to analyze the uploaded audio file and get the results, which can then be stored in the database or returned in the response as needed.
    const tempFilePath = path.join(
      os.tmpdir(),
      `${creationTime}-${audioFile.originalname}`,
    ); // Create a temporary file path for the uploaded audio file to be analyzed by the Python script

    await fs.writeFile(tempFilePath, audioFile.buffer); // Write the uploaded audio file to a temporary file on the server's filesystem for analysis by the Python script
    let analysisResults: AudioAnalysisResult;
    try {
      analysisResults = await analyzeAudio(tempFilePath); // Analyze the uploaded audio file using the analyzeAudio function and get the results
      console.log("Audio analysis results:", analysisResults); // Log the analysis results for debugging purposes
    } finally {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }
    const audio = await prisma.audioFile.create({
      data: {
        fileName: audioFile.originalname, // Store the original name of the uploaded audio file in the database
        mimeType: audioFile.mimetype, // Store the MIME type of the uploaded audio file in the database
        storageKey: audioReferenceKey, // Store the storage key of the uploaded audio file in the database
        size: audioFile.size, // Store the size of the uploaded audio file in the database
        createdAt: creationTime, // Store the creation date of the audio file in the database
      },
    });
    const soundProfile = await prisma.soundProfile.create({
      data: {
        audioFileId: audio.id,
        durationSeconds: analysisResults.durationSeconds,
        tempoBpm: analysisResults.tempoBpm,
        estimatedPitchHz: analysisResults.estimatedPitchHz,
        rmsMean: analysisResults.dna.rmsMean,
        spectralCentroidMean: analysisResults.dna.spectralCentroidMean,
        spectralRolloffMean: analysisResults.dna.spectralRolloffMean,
        spectralBandwidthMean: analysisResults.dna.spectralBandwidthMean,
        zeroCrossingRateMean: analysisResults.dna.zeroCrossingRateMean,
        mfccMean: analysisResults.dna.mfccMean,
        mfccStd: analysisResults.dna.mfccStd,
        chromaMean: analysisResults.dna.chromaMean,
        rawAnalysis: analysisResults,
      },
    });

    console.log("Sound profile created in database:", soundProfile); // Log the created sound profile for debugging purposes
    // Here you can implement the logic to process the submitted audio URI as needed
    res.status(200).json({ message: "Audio submitted successfully!" }); // Respond with a success message
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to upload audio file." }); // Respond with an error message if the upload fails
  }
});
