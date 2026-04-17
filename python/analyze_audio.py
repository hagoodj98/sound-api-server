import argparse
import json
import warnings
from pathlib import Path

import librosa
import numpy as np

warnings.filterwarnings(
    "ignore",
    message="PySoundFile failed. Trying audioread instead.",
    category=UserWarning,
)
warnings.filterwarnings(
    "ignore",
    message="librosa.core.audio.__audioread_load",
    category=FutureWarning,
)


def to_float(value):
    if isinstance(value, np.ndarray):
        if value.size == 0:
            return None
        return float(value.squeeze())
    return float(value)


def to_list(values):
    return [float(value) for value in values]


def analyze_audio(file_path: Path):
    signal, sample_rate = librosa.load(file_path, sr=None, mono=True)

    tempo, _ = librosa.beat.beat_track(y=signal, sr=sample_rate)
    pitch_track = librosa.yin(
        signal,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sample_rate,
    )
    valid_pitch = pitch_track[np.isfinite(pitch_track)]

    chroma = librosa.feature.chroma_stft(y=signal, sr=sample_rate)
    mfcc = librosa.feature.mfcc(y=signal, sr=sample_rate, n_mfcc=13)
    spectral_centroid = librosa.feature.spectral_centroid(y=signal, sr=sample_rate)
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=signal, sr=sample_rate)
    spectral_rolloff = librosa.feature.spectral_rolloff(y=signal, sr=sample_rate)
    zero_crossing_rate = librosa.feature.zero_crossing_rate(signal)
    rms = librosa.feature.rms(y=signal)

    analysis = {
        "fileName": file_path.name,
        "durationSeconds": float(librosa.get_duration(y=signal, sr=sample_rate)),
        "sampleRate": int(sample_rate),
        "tempoBpm": to_float(tempo),
        "estimatedPitchHz": float(np.median(valid_pitch)) if valid_pitch.size else None,
        "dna": {
            "mfccMean": to_list(np.mean(mfcc, axis=1)),
            "mfccStd": to_list(np.std(mfcc, axis=1)),
            "chromaMean": to_list(np.mean(chroma, axis=1)),
            "spectralCentroidMean": float(np.mean(spectral_centroid)),
            "spectralBandwidthMean": float(np.mean(spectral_bandwidth)),
            "spectralRolloffMean": float(np.mean(spectral_rolloff)),
            "zeroCrossingRateMean": float(np.mean(zero_crossing_rate)),
            "rmsMean": float(np.mean(rms)),
        },
    }

    return analysis


def main():
    parser = argparse.ArgumentParser(description="Analyze an audio file with librosa")
    parser.add_argument("file", help="Path to an audio file")
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    result = analyze_audio(file_path)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()