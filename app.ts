import cors from "cors";
import express from "express";
import multer from "multer";
import { promises as fs, createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { s3Client } from "./lib/s3";
import {
  ListObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "./lib/database";
import { analyzeAudio, convertAudio } from "./pythonScript";
import {
  getEnergyLevel,
  getMoodLabel,
  getTempoLabel,
  getToneLabel,
  safeDecodeFileName,
} from "./utils/helperSoundFunctions";
import {
  validateAudioFileIdParamSchema,
  validateImportedAudioAnalysisSchema,
  validateImportedAudioFileSchema,
  validateImportedAudioTempoSchema,
  validateReconversionQuerySchema,
} from "./utils/inputValidation";
import type { AudioAnalysisResult, SoundProfile } from "./types/types";
import {
  buildAutoConversionPlan,
  clamp,
  GAIN_DB_MAX,
  GAIN_DB_MIN,
  PITCH_SHIFT_SEMITONES_MAX,
  PITCH_SHIFT_SEMITONES_MIN,
  safeNumber,
} from "./utils/conversionMath";

const temptStorage = multer.memoryStorage(); // Use memory storage for multer to store uploaded files in memory
const upload = multer({ storage: temptStorage }); // Create a multer instance with the memory storage configuration
export const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => {
  res.send("Hello, SonicDNA!");
});

app.post("/api/submit-audio", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file; // Get the uploaded audio file from the request
    if (!audioFile) {
      return res.status(400).json({ message: "No audio file uploaded." }); // Respond with an error if no audio file was uploaded
    }
    // React Native FormData percent-encodes the multipart filename (e.g. spaces -> %20),
    // so decode it before storing/using anywhere.
    audioFile.originalname = safeDecodeFileName(audioFile.originalname);
    const creationTime = new Date().toISOString(); // Get the current timestamp to create a unique reference key for the audio file
    const baseName = audioFile.originalname.endsWith(".m4a")
      ? audioFile.originalname
      : `${audioFile.originalname}.m4a`;
    const audioReferenceKey = `audio/${creationTime}-${baseName}`; // Create a unique reference key for the audio file to be stored in Cloudflare R2

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
    //once the file is uploaded to R2 and the metadata is stored in the database, you can implement any additional logic here, such as processing the audio file using SonicDNA
    // For example, you can call the analyzeAudio function to analyze the uploaded audio file and get the results, which can then be stored in the database or returned in the response as needed.
    const tempFilePath = path.join(
      os.tmpdir(),
      `${creationTime}-${audioFile.originalname}`,
    ); // Create a temporary file path for the uploaded audio file to be analyzed by the Python script

    await fs.writeFile(tempFilePath, audioFile.buffer); // Write the uploaded audio file to a temporary file on the server's filesystem for analysis by the Python script
    let analysisResults: AudioAnalysisResult;
    try {
      analysisResults = await analyzeAudio(tempFilePath); // Analyze the uploaded audio file using the analyzeAudio function and get the results
    } finally {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }
    // After successfully uploading the audio file to Cloudflare R2, we can now store the metadata of the uploaded audio file in the database using Prisma. This includes information such as the original file name, MIME type, storage key, file size, and creation date.
    const audioFileRecordPs = await prisma.audioFile.create({
      data: {
        fileName: audioFile.originalname, // Store the original name of the uploaded audio file in the database
        mimeType: audioFile.mimetype, // Store the MIME type of the uploaded audio file in the database
        storageKey: audioReferenceKey, // Store the storage key of the uploaded audio file in the database
        size: audioFile.size, // Store the size of the uploaded audio file in the database
        createdAt: creationTime, // Store the creation date of the audio file in the database
      },
    });

    // After successfully uploading the audio file to Cloudflare R2 and storing its metadata in the database, we can now create a sound profile in the database using the analysis results obtained from the Python script. The sound profile will include various attributes such as duration, tempo, estimated pitch, and DNA features extracted from the audio analysis.
    const soundProfileRecordPS = await prisma.soundProfile.create({
      data: {
        audioFileId: audioFileRecordPs.id,
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

    const responseSoundProfile: SoundProfile = {
      audioFileId: "",
      tempoBpm: 0,
      estimatedPitchHz: 0,
      audioName: "",
      energyLevel: "",
      tempoLabel: "",
      tone: "",
      mood: "",
    };

    const fileName = audioReferenceKey
      .split("/")
      .pop()
      ?.split("-")
      .pop()
      ?.split(".")
      .shift();
    if (fileName) {
      responseSoundProfile.audioName = fileName;
    }
    const rmsMean = soundProfileRecordPS.rmsMean;
    const tempoBpm = Math.floor(soundProfileRecordPS.tempoBpm);
    const spectralCentroidMean = soundProfileRecordPS.spectralCentroidMean;
    responseSoundProfile.tempoBpm = tempoBpm;
    responseSoundProfile.audioName = fileName || "Unknown";
    responseSoundProfile.estimatedPitchHz =
      soundProfileRecordPS.estimatedPitchHz;
    responseSoundProfile.energyLevel = getEnergyLevel(rmsMean);
    responseSoundProfile.tempoLabel = getTempoLabel(tempoBpm);
    responseSoundProfile.tone = getToneLabel(spectralCentroidMean);
    responseSoundProfile.mood = getMoodLabel({
      tempoBpm,
      rmsMean,
      spectralCentroidMean,
    });
    responseSoundProfile.audioFileId =
      soundProfileRecordPS.audioFileId.toString();

    // Here you can implement the logic to process the submitted audio URI as needed
    res.status(200).json({
      message: "Audio submitted successfully!",
      soundProfile: responseSoundProfile,
    }); // Respond with a success message
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to upload audio file." }); // Respond with an error message if the upload fails
  }
});
app.get("/api/get-audio", async (req, res) => {
  try {
    //fetch audio files from the cloudflare R2 bucket using the S3 client and return the list of audio files in the response
    const list = await s3Client.send(
      // Create a ListObjectsCommand to list the objects in the specified bucket in Cloudflare R2
      new ListObjectsCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, // Use the Cloudflare R2 bucket name from environment variables
      }),
    );

    const audioFileList: SoundProfile[] = [];

    // Iterate through the list of audio files returned by the ListObjectsCommand and extract the keys of the audio files to be included in the response
    for (const file of list.Contents || []) {
      if (!file.Key) {
        continue;
      }

      const soundProfile: SoundProfile = {
        audioFileId: "",
        tempoBpm: 0,
        estimatedPitchHz: 0,
        audioName: "",
        energyLevel: "",
        tempoLabel: "",
        tone: "",
        mood: "",
      };

      const audioFileRecord = await prisma.audioFile.findUnique({
        where: {
          storageKey: file.Key, // Use the storage key of the audio file to find its corresponding record in the database
        },
        include: {
          soundProfile: true, // Include the associated sound profile data when retrieving the audio file record from the database
        },
      });
      //clean the string by only getting the name between - and .m4a
      //audio/2026-05-07T02:17:54.159Z-yessir.m4a
      const fileName = file.Key?.split("/")
        .pop()
        ?.split("-")
        .pop()
        ?.split(".")
        .shift();
      if (fileName) {
        soundProfile.audioName = fileName;
      }
      if (audioFileRecord && audioFileRecord.soundProfile) {
        const rmsMean = audioFileRecord.soundProfile.rmsMean;
        const tempoBpm = Math.floor(audioFileRecord.soundProfile.tempoBpm);
        const spectralCentroidMean =
          audioFileRecord.soundProfile.spectralCentroidMean;

        soundProfile.audioFileId = audioFileRecord.id.toString();
        soundProfile.tempoBpm = tempoBpm;
        soundProfile.audioName = fileName || "Unknown";
        soundProfile.estimatedPitchHz =
          audioFileRecord.soundProfile.estimatedPitchHz;
        soundProfile.energyLevel = getEnergyLevel(rmsMean);
        soundProfile.tempoLabel = getTempoLabel(tempoBpm);
        soundProfile.tone = getToneLabel(spectralCentroidMean);
        soundProfile.mood = getMoodLabel({
          tempoBpm,
          rmsMean,
          spectralCentroidMean,
        });
        // Construct the URL for streaming the audio file using the API endpoint and the audio file's unique ID from the database
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
app.post(
  "/api/convert-audio/:audioFileId",
  upload.single("audio"),
  async (req, res) => {
    try {
      const parsedParams = validateAudioFileIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        return res.status(400).json({ message: "Invalid audio file id." });
      }
      const audioFileId = parsedParams.data.audioFileId; // Get the audio file ID from the request parameters

      const audioFile = req.file; // Get the uploaded audio file from the request
      if (!audioFile) {
        return res.status(400).json({ message: "No audio file uploaded." }); // Respond with an error if no audio file was uploaded
      }
      // React Native FormData percent-encodes the multipart filename — decode it.
      audioFile.originalname = safeDecodeFileName(audioFile.originalname);
      const importedFileValidation =
        validateImportedAudioFileSchema.safeParse(audioFile);
      if (!importedFileValidation.success) {
        return res.status(400).json({
          message: importedFileValidation.error.issues[0]?.message,
        });
      }
      const profile = await prisma.soundProfile.findUnique({
        where: {
          audioFileId: audioFileId, // Use the audio file ID to find the corresponding sound profile record in the database
        },
      });
      if (!profile) {
        return res.status(404).json({ message: "Audio file not found." }); // Respond with an error if no sound profile record is found for the given audio file ID
      }
      // Create a temporary file path for the uploaded audio file to be analyzed by the Python script for conversion
      const importedTempPath = path.join(
        os.tmpdir(),
        `${new Date().toISOString()}-${audioFile.originalname}`,
      );
      // Write the uploaded audio file to a temporary file on the server's filesystem for analysis by the Python script for conversion
      await fs.writeFile(importedTempPath, audioFile.buffer);

      const importedAnalysis = await analyzeAudio(importedTempPath);
      const importedAnalysisValidation =
        validateImportedAudioAnalysisSchema.safeParse(importedAnalysis);
      if (!importedAnalysisValidation.success) {
        await fs.unlink(importedTempPath).catch(() => undefined);
        return res.status(413).json({
          message: importedAnalysisValidation.error.issues[0]?.message,
        });
      }

      const profileAnalysis =
        profile.rawAnalysis as unknown as AudioAnalysisResult;
      const {
        targetBPM,
        importedTempo,
        tempoRatio,
        pitchShiftSemitones,
        gainDb,
      } = buildAutoConversionPlan(profileAnalysis, importedAnalysis);

      // Create temporary file paths for audio conversion
      const conversionTimestamp = new Date().toISOString();
      const convertedTempFileName = `converted-${conversionTimestamp}.wav`;
      const convertedTempPath = path.join(os.tmpdir(), convertedTempFileName);

      try {
        // Apply DSP effects: time-stretch, pitch-shift, and gain
        await convertAudio(
          importedTempPath,
          convertedTempPath,
          tempoRatio,
          pitchShiftSemitones,
          gainDb,
        );
      } catch (conversionError) {
        console.error("Audio conversion failed:", conversionError);
        // Return error response if conversion fails
        return res
          .status(500)
          .json({ message: "Failed to apply audio transformations." });
      }

      // Upload converted audio to Cloudflare R2
      let convertedAudioUri: string | null = null;
      try {
        // Don't save to R2 or database - just keep in temp and stream from there
        // Return a temp stream URI so user can preview before exporting
        convertedAudioUri = `/api/stream-temp-audio/${convertedTempFileName}`;
      } catch (uploadError) {
        console.error("Failed to prepare converted audio:", uploadError);
        // Clean up temp file but continue with response (provide partial result)
      }

      // Clean up temporary files
      try {
        await fs.unlink(importedTempPath).catch(() => undefined);
        // Don't delete convertedTempPath yet - it's being streamed by the client
        // The file will auto-cleanup by OS temp directory policies
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }

      res.status(200).json({
        message:
          "Audio conversion complete. DSP effects applied and file processed.",
        convertedAudioUri,
        conversionPlan: {
          targetBPM: targetBPM,
          importedTempoBpm: importedTempo,
          pitchShiftSemitones,
          gainDb,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to convert audio file." }); // Respond with an error message if conversion fails
    }
  },
);
app.get("/api/stream-audio/:audioFileId", async (req, res) => {
  try {
    const audioFileId = Number(req.params.audioFileId);
    if (Number.isNaN(audioFileId)) {
      return res.status(400).json({ message: "Invalid audio file id." });
    }

    const audioFileRecord = await prisma.audioFile.findUnique({
      where: { id: audioFileId },
    });

    if (!audioFileRecord) {
      return res.status(404).json({ message: "Audio file not found." });
    }

    const audioObject = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: audioFileRecord.storageKey,
      }),
    );

    if (!audioObject.Body) {
      return res.status(404).json({ message: "Audio object is empty." });
    }

    if (audioObject.ContentType || audioFileRecord.mimeType) {
      res.setHeader(
        "Content-Type",
        audioObject.ContentType || audioFileRecord.mimeType,
      );
    }
    if (audioObject.ContentLength) {
      res.setHeader("Content-Length", audioObject.ContentLength.toString());
    }
    if (audioObject.ETag) {
      res.setHeader("ETag", audioObject.ETag);
    }
    res.setHeader("Accept-Ranges", "bytes");
    // Stream the audio file from Cloudflare R2 to the client using the response object
    (audioObject.Body as NodeJS.ReadableStream).pipe(res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to stream audio file." });
  }
});

app.get("/api/stream-temp-audio/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    // Validate filename to prevent path traversal attacks
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ message: "Invalid filename." });
    }
    const tempFilePath = path.join(os.tmpdir(), filename);

    // Check if file exists
    try {
      await fs.access(tempFilePath);
    } catch {
      return res
        .status(404)
        .json({ message: "Temporary audio file not found." });
    }

    // Set appropriate headers for audio streaming
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");

    // Get file stats for Content-Length
    const stats = await fs.stat(tempFilePath);
    res.setHeader("Content-Length", stats.size.toString());

    // Stream the temporary audio file to the client.
    const fileStream = createReadStream(tempFilePath);
    fileStream.pipe(res);
    // Handle errors during streaming and ensure the response is properly ended in case of an error
    fileStream.on("error", (error: Error) => {
      console.error("Error streaming temp audio:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ message: "Failed to stream temporary audio file." });
      }
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to stream temporary audio file." });
  }
});

app.post(
  "/api/reconvert-audio/:audioFileId",
  upload.single("audio"),
  async (req, res) => {
    try {
      const parsedParams = validateAudioFileIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        return res.status(400).json({ message: "Invalid audio file id." });
      }

      const audioFile = req.file;
      if (!audioFile) {
        return res.status(400).json({ message: "No audio file uploaded." });
      }
      // React Native FormData percent-encodes the multipart filename — decode it.
      audioFile.originalname = safeDecodeFileName(audioFile.originalname);

      const importedFileValidation =
        validateImportedAudioFileSchema.safeParse(audioFile);
      if (!importedFileValidation.success) {
        return res.status(400).json({
          message: importedFileValidation.error.issues[0]?.message,
        });
      }

      const parsedQuery = validateReconversionQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          message:
            "Missing or invalid reconversion parameters. Expected targetBPM, pitchShiftSemitones, gainDb.",
        });
      }
      const {
        targetBPM,
        pitchShiftSemitones: requestedPitchShiftSemitones,
        gainDb: requestedGainDb,
        importedTempoBpm: providedImportedTempoBpm,
      } = parsedQuery.data;

      // Create a temporary file path for the uploaded audio file
      const importedTempPath = path.join(
        os.tmpdir(),
        `${new Date().toISOString()}-${audioFile.originalname}`,
      );
      await fs.writeFile(importedTempPath, audioFile.buffer);

      // Skip re-analysis if the client already supplied the imported tempo — saves ~10-30s of librosa processing
      let importedTempo: number;
      if (providedImportedTempoBpm !== undefined) {
        importedTempo = providedImportedTempoBpm;
      } else {
        const importedAnalysis = await analyzeAudio(importedTempPath);
        const importedAnalysisValidation =
          validateImportedAudioTempoSchema.safeParse(importedAnalysis);
        if (!importedAnalysisValidation.success) {
          await fs.unlink(importedTempPath).catch(() => undefined);
          return res.status(400).json({
            message: "Imported audio tempo could not be determined.",
          });
        }
        importedTempo = safeNumber(importedAnalysis?.tempoBpm, 120);
      }

      const tempoRatio = clamp(
        targetBPM / Math.max(importedTempo, 1e-9),
        0.75,
        1.25,
      );
      const pitchShiftSemitones = clamp(
        requestedPitchShiftSemitones,
        PITCH_SHIFT_SEMITONES_MIN,
        PITCH_SHIFT_SEMITONES_MAX,
      );
      const gainDb = clamp(requestedGainDb, GAIN_DB_MIN, GAIN_DB_MAX);

      const conversionTimestamp = new Date().toISOString();
      const convertedTempFileName = `reconverted-${conversionTimestamp}.wav`;
      const convertedTempPath = path.join(os.tmpdir(), convertedTempFileName);

      await convertAudio(
        importedTempPath,
        convertedTempPath,
        tempoRatio,
        pitchShiftSemitones,
        gainDb,
      );

      try {
        await fs.unlink(importedTempPath).catch(() => undefined);
      } catch (cleanupError) {
        console.error("Reconversion cleanup error:", cleanupError);
      }

      return res.status(200).json({
        message: "Audio re-conversion complete.",
        convertedAudioUri: `/api/stream-temp-audio/${convertedTempFileName}`,
        conversionPlan: {
          targetBPM,
          pitchShiftSemitones,
          gainDb,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to reconvert audio file." });
    }
  },
);
