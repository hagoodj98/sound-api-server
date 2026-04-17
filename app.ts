import cors from "cors";
import express from "express";
import multer from "multer";
import { s3Client } from "./lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./lib/database";
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
    const audio = await prisma.audioFiles.create({
      data: {
        fileName: audioFile.originalname, // Store the original name of the uploaded audio file in the database
        mimeType: audioFile.mimetype, // Store the MIME type of the uploaded audio file in the database
        storage_key: `audio/${Date.now()}-${audioFile.originalname}`, // Store the storage key of the uploaded audio file in the database
        size: audioFile.size, // Store the size of the uploaded audio file in the database
        createdAt: new Date(), // Store the creation date of the audio file in the database
      },
    });
    /**
     * {
  id: 1,
  fileName: 'recording.m4a',
  storage_key: 'audio/1776383328208-recording.m4a',
  size: 49487,
  mimeType: 'audio/m4a',
  createdAt: 2026-04-16T23:48:48.208Z
}
     */
    console.log(audio, "Audio file metadata stored in database"); // Log the audio file metadata stored in the database for debugging purposes
    //once the file is uploaded to R2 and the metadata is stored in the database, you can implement any additional logic here, such as processing the audio file using the SOUND DNA API

    // Here you can implement the logic to process the submitted audio URI as needed
    res.status(200).json({ message: "Audio submitted successfully!" }); // Respond with a success message
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to upload audio file." }); // Respond with an error message if the upload fails
  }
});
