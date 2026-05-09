export type AudioUploadFileType = Blob & {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

export type DNA = {
  mfccMean: number[];
  mfccStd: number[];
  chromaMean: number[];
  spectralCentroidMean: number;
  spectralBandwidthMean: number;
  spectralRolloffMean: number;
  zeroCrossingRateMean: number;
  rmsMean: number;
};

export type AudioAnalysisResult = {
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  tempoBpm: number;
  estimatedPitchHz: number;
  dna: DNA;
};

export type SoundProfile = {
  audioFileId: string;
  tempoBpm: number;
  audioName: string;
  estimatedPitchHz: number;
  energy?: number;
  energyLevel?: string;
  tempoLabel?: string;
  tone?: string;
  mood?: string;
};
