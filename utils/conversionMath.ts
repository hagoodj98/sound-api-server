import type { AudioAnalysisResult } from "../types/types";

export const PITCH_SHIFT_SEMITONES_MIN = -12;
export const PITCH_SHIFT_SEMITONES_MAX = 12;
export const GAIN_DB_MIN = -12;
export const GAIN_DB_MAX = 12;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const safeNumber = (value: unknown, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export const buildAutoConversionPlan = (
  profileAnalysis: AudioAnalysisResult,
  importedAnalysis: AudioAnalysisResult,
) => {
  const profileTempo = safeNumber(profileAnalysis?.tempoBpm, 120);
  const importedTempo = safeNumber(importedAnalysis?.tempoBpm, 120);
  const profilePitch = safeNumber(
    profileAnalysis?.estimatedPitchHz,
    importedAnalysis?.estimatedPitchHz || 440,
  );
  const importedPitch = safeNumber(importedAnalysis?.estimatedPitchHz, 440);
  const profileRms = safeNumber(profileAnalysis?.dna?.rmsMean, 0.1);
  const importedRms = safeNumber(importedAnalysis?.dna?.rmsMean, 0.1);

  const tempoRatio = clamp(
    profileTempo / Math.max(importedTempo, 1e-9),
    0.75,
    1.25,
  );
  const pitchShiftSemitones = clamp(
    12 * Math.log2(profilePitch / Math.max(importedPitch, 1e-9)),
    -6,
    6,
  );
  const gainDb = clamp(
    20 * Math.log10(profileRms / Math.max(importedRms, 1e-9)),
    -12,
    12,
  );

  return {
    targetBPM: profileTempo,
    importedTempo,
    tempoRatio,
    pitchShiftSemitones,
    gainDb,
  };
};
