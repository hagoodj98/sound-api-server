import cors from "cors";
import express from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { s3Client } from "./lib/s3";
import { ListObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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
type SoundProfile = {
  audioFileId: string;
  audio?: string;
  tempoBpm: number;
  estimatedPitchHz: number;
  energy?: number;
};

const temptStorage = multer.memoryStorage(); // Use memory storage for multer to store uploaded files in memory
const upload = multer({ storage: temptStorage }); // Create a multer instance with the memory storage configuration
export const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  console.log(req.url);

  res.send("Hello, Sound DNA API!");
});

app.post("/api/submit-audio", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file; // Get the uploaded audio file from the request
    if (!audioFile) {
      return res.status(400).json({ message: "No audio file uploaded." }); // Respond with an error if no audio file was uploaded
    }
    const creationTime = new Date().toISOString(); // Get the current timestamp to create a unique reference key for the audio file
    const audioReferenceKey = `audio/${creationTime}-${audioFile.originalname}`; // Create a unique reference key for the audio file to be stored in Cloudflare R2

    // Upload the audio file to Cloudflare R2 using the S3 client
    const uploadResult = await s3Client.send(
      // Create a PutObjectCommand to upload the audio file to the specified bucket and key in Cloudflare R2
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, // Use the Cloudflare R2 bucket name from environment variables
        Key: audioReferenceKey, // Set a unique key for the audio file in the bucket
        Body: audioFile.buffer, // Use the buffer of the uploaded audio file as the body of the S3 object
        ContentType: audioFile.mimetype, // Set the content type of the S3 object to the MIME type of the uploaded audio file
      }),
    );
    console.log(uploadResult, "uploaded");

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
    // After successfully uploading the audio file to Cloudflare R2, we can now store the metadata of the uploaded audio file in the database using Prisma. This includes information such as the original file name, MIME type, storage key, file size, and creation date.
    const audio = await prisma.audioFile.create({
      data: {
        fileName: audioFile.originalname, // Store the original name of the uploaded audio file in the database
        mimeType: audioFile.mimetype, // Store the MIME type of the uploaded audio file in the database
        storageKey: audioReferenceKey, // Store the storage key of the uploaded audio file in the database
        size: audioFile.size, // Store the size of the uploaded audio file in the database
        createdAt: creationTime, // Store the creation date of the audio file in the database
      },
    });
    // After successfully uploading the audio file to Cloudflare R2 and storing its metadata in the database, we can now create a sound profile in the database using the analysis results obtained from the Python script. The sound profile will include various attributes such as duration, tempo, estimated pitch, and DNA features extracted from the audio analysis.
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
app.get("/api/get-audio", async (req, res) => {
  try {
    //fetch audio files from the cloudflare R2 bucket using the S3 client and return the list of audio files in the response
    const storage = await s3Client.send(
      // Create a ListObjectsCommand to list the objects in the specified bucket in Cloudflare R2
      new ListObjectsCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, // Use the Cloudflare R2 bucket name from environment variables
      }),
    );
    // The ListObjectsCommand returns a list of objects in the specified bucket, which includes the audio files that have been uploaded to Cloudflare R2. We can then extract the keys of the audio files from the response and return them in the API response as needed.
    const audioFiles = storage.Contents;
    const audioFileList: SoundProfile[] = [];
    // Iterate through the list of audio files returned by the ListObjectsCommand and extract the keys of the audio files to be included in the response
    for (const file of audioFiles || []) {
      console.log("Audio file in R2 bucket:", file.Key); // Log the key of each audio file in the R2 bucket for debugging purposes
      const soundProfile: SoundProfile = {
        audioFileId: "",
        tempoBpm: 0,
        estimatedPitchHz: 0,
        energy: 0,
      };
      if (file.Key) {
        console.log(file);
        const audioFileRecord = await prisma.audioFile.findUnique({
          where: {
            storageKey: file.Key, // Use the storage key of the audio file to find its corresponding record in the database
          },
          include: {
            soundProfile: true, // Include the associated sound profile data when retrieving the audio file record from the database
          },
        });
        console.log(audioFileRecord);
        if (audioFileRecord && audioFileRecord.soundProfile) {
          soundProfile.audioFileId = audioFileRecord.id.toString();
          soundProfile.tempoBpm = audioFileRecord.soundProfile.tempoBpm;
          soundProfile.estimatedPitchHz =
            audioFileRecord.soundProfile.estimatedPitchHz;
          soundProfile.energy = audioFileRecord.soundProfile.rmsMean;
        }
        audioFileList.push(soundProfile); // Add the extracted sound profile data to the list of audio files to be returned in the response
      }
    }

    // Here you can implement the logic to retrieve the list of audio files from Cloudflare R2 and return it in the response as needed
    res.status(200).json({
      message: "Audio files retrieved successfully!",
      audioFiles: audioFileList,
    }); // Respond with a success message
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve audio files." }); // Respond with an error message if retrieval fails
  }
});
