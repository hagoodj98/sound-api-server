const getEnergyLevel = (rmsMean: number) => {
  if (rmsMean < 0.0035) return "Low";
  if (rmsMean < 0.012) return "Medium";
  return "High";
};

const getTempoLabel = (tempoBpm: number) => {
  if (tempoBpm < 85) return "Slow";
  if (tempoBpm < 125) return "Groovy";
  if (tempoBpm < 165) return "Upbeat";
  return "Fast";
};

const getToneLabel = (spectralCentroidMean: number) => {
  if (spectralCentroidMean < 1400) return "Warm";
  if (spectralCentroidMean < 3000) return "Balanced";
  return "Bright";
};

const getMoodLabel = ({
  tempoBpm,
  rmsMean,
  spectralCentroidMean,
}: {
  tempoBpm: number;
  rmsMean: number;
  spectralCentroidMean: number;
}) => {
  const energyLevel = getEnergyLevel(rmsMean);
  const tempoLabel = getTempoLabel(tempoBpm);
  const toneLabel = getToneLabel(spectralCentroidMean);

  if (
    energyLevel === "Low" &&
    (tempoLabel === "Slow" || tempoLabel === "Groovy")
  ) {
    return "Calm";
  }
  if (
    energyLevel === "Low" &&
    (tempoLabel === "Upbeat" || tempoLabel === "Fast")
  ) {
    return "Airy";
  }
  if (
    energyLevel === "High" &&
    (tempoLabel === "Upbeat" || tempoLabel === "Fast")
  ) {
    return "Hyped";
  }
  if (energyLevel === "High" && toneLabel === "Warm") {
    return "Driving";
  }
  if (toneLabel === "Bright" && tempoLabel === "Fast") {
    return "Electric";
  }
  if (energyLevel === "Medium" && toneLabel === "Warm") {
    return "Chill";
  }

  return "Focused";
};

/**
 * React Native's FormData percent-encodes the multipart filename
 * (e.g. "Test audio" -> "Test%20audio"), so multer reports it that way.
 * Decode it before persisting / using in storage keys.
 * Falls back to the raw value if it isn't valid percent-encoding.
 */
const safeDecodeFileName = (name: string): string => {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

export {
  getEnergyLevel,
  getTempoLabel,
  getToneLabel,
  getMoodLabel,
  safeDecodeFileName,
};
