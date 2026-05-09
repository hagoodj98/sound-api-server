import { z } from "zod";

const allowedImportedAudioMimeTypes = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
] as const;
//comment
export const MAX_IMPORTED_AUDIO_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMPORTED_AUDIO_DURATION_SECONDS = 90; // 90 seconds

export const validateImportedAudioFileSchema = z.object({
  originalname: z
    .string()
    .min(1, { message: "Imported audio file name is required." }),
  mimetype: z.enum(allowedImportedAudioMimeTypes, {
    message: "Unsupported file type. Please upload MP3, WAV, or M4A audio.",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_IMPORTED_AUDIO_FILE_SIZE_BYTES, {
      message: `Imported file exceeds ${Math.floor(MAX_IMPORTED_AUDIO_FILE_SIZE_BYTES / (1024 * 1024))}MB limit.`,
    }),
});

export const validateImportedAudioAnalysisSchema = z.object({
  durationSeconds: z
    .number()
    .positive({ message: "Imported audio duration could not be determined." })
    .max(MAX_IMPORTED_AUDIO_DURATION_SECONDS, {
      message: `Imported audio is too long. Maximum duration is ${MAX_IMPORTED_AUDIO_DURATION_SECONDS} seconds.`,
    }),
  tempoBpm: z.number(),
});

export const validateImportedAudioTempoSchema = z.object({
  tempoBpm: z.number(),
});

export const validateAudioFileIdParamSchema = z.object({
  audioFileId: z.coerce
    .number()
    .int()
    .positive({ message: "Invalid audio file id." }),
});

export const validateReconversionQuerySchema = z.object({
  targetBPM: z.coerce.number().finite(),
  pitchShiftSemitones: z.coerce.number().finite(),
  gainDb: z.coerce.number().finite(),
  importedTempoBpm: z.coerce.number().finite().optional(),
});
