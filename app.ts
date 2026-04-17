import cors from "cors";
import express from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { s3Client } from "./lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
//import { prisma } from "./lib/database";
import { analyzeAudio } from "./pythonScript";

type AudioAnalysisResult = {
  fileName: string;
  duration: number;
  sampleRate: number;
  tempoBpm: number;
  estimatedPitchHz: number;
  dna: {
    mfccMean: number[];
    mfccStd: number[];
    chromaMean: number[];
    spectralCentroidMean: number;
    spectralBandwidthMean: number;
    spectralRolloffMean: number;
    zeroCrossingRateMean: number;
    rmsMean: number;
  };
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
  console.log(req); // Log the uploaded file information for debugging purposes
  try {
    const audioFile = req.file; // Get the uploaded audio file from the request
    if (!audioFile) {
      return res.status(400).json({ message: "No audio file uploaded." }); // Respond with an error if no audio file was uploaded
    }
    // Upload the audio file to Cloudflare R2 using the S3 client
    await s3Client.send(
      // Create a PutObjectCommand to upload the audio file to the specified bucket and key in Cloudflare R2
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, // Use the Cloudflare R2 bucket name from environment variables
        Key: `audio/${Date.now()}-${audioFile.originalname}`, // Set a unique key for the audio file in the bucket
        Body: audioFile.buffer, // Use the buffer of the uploaded audio file as the body of the S3 object
        ContentType: audioFile.mimetype, // Set the content type of the S3 object to the MIME type of the uploaded audio file
      }),
    );
    /*
      const audio = await prisma.audioFiles.create({
        data: {
          fileName: audioFile.originalname, // Store the original name of the uploaded audio file in the database
          mimeType: audioFile.mimetype, // Store the MIME type of the uploaded audio file in the database
          storage_key: `audio/${Date.now()}-${audioFile.originalname}`, // Store the storage key of the uploaded audio file in the database
          size: audioFile.size, // Store the size of the uploaded audio file in the database
          createdAt: new Date(), // Store the creation date of the audio file in the database
        },
      });
    */

    //once the file is uploaded to R2 and the metadata is stored in the database, you can implement any additional logic here, such as processing the audio file using the SOUND DNA API
    // For example, you can call the analyzeAudio function to analyze the uploaded audio file and get the results, which can then be stored in the database or returned in the response as needed.
    const tempFilePath = path.join(
      os.tmpdir(),
      `${Date.now()}-${audioFile.originalname}`,
    ); // Create a temporary file path for the uploaded audio file to be analyzed by the Python script

    await fs.writeFile(tempFilePath, audioFile.buffer); // Write the uploaded audio file to a temporary file on the server's filesystem for analysis by the Python script
    let analysisResults: AudioAnalysisResult;
    try {
      analysisResults = await analyzeAudio(tempFilePath); // Analyze the uploaded audio file using the analyzeAudio function and get the results
      console.log("Audio analysis results:", analysisResults); // Log the analysis results for debugging purposes
    } finally {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }

    // Here you can implement the logic to process the submitted audio URI as needed
    res.status(200).json({ message: "Audio submitted successfully!" }); // Respond with a success message
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to upload audio file." }); // Respond with an error message if the upload fails
  }
});
