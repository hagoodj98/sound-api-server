import argparse
import json
import warnings
import soundfile as sf
from pathlib import Path
import numpy as np

import librosa

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


def convert_audio(
    input_file_path: Path,
    output_file_path: Path,
    tempo_ratio: float,
    pitch_shift_semitones: float,
    gain_db: float,
):
    """
    Apply audio transformations: time-stretch, pitch-shift, and gain.
    
    Args:
        input_file_path: Path to the input audio file
        output_file_path: Path to save the converted audio file
        tempo_ratio: Tempo speed ratio (e.g., 1.2 for 20% faster)
        pitch_shift_semitones: Pitch shift in semitones (e.g., 2 for +2 semitones)
        gain_db: Gain adjustment in decibels (e.g., 3 for +3dB)
    
    Returns:
        Dictionary with conversion info including output path
    """
    # Load audio
    signal, sample_rate = librosa.load(input_file_path, sr=None, mono=True)
    duration_seconds = librosa.get_duration(y=signal, sr=sample_rate)
    
    # Apply time-stretch (tempo change)
    if abs(tempo_ratio - 1.0) > 0.01:  # Only apply if significantly different
        signal = librosa.effects.time_stretch(signal, rate=tempo_ratio)
    
    # Apply pitch-shift (in semitones)
    if abs(pitch_shift_semitones) > 0.01:  # Only apply if significantly different
        signal = librosa.effects.pitch_shift(
            signal, sr=sample_rate, n_steps=pitch_shift_semitones
        )
    
    # Apply gain (convert dB to linear amplitude)
    if abs(gain_db) > 0.01:  # Only apply if significantly different
        gain_linear = 10 ** (gain_db / 20.0)
        signal = signal * gain_linear
    
    # Prevent clipping by soft limiting
    max_val = np.abs(signal).max()
    if max_val > 1.0:
        signal = signal / max_val  # Normalize to prevent clipping
    
    # Save output audio file as WAV
    sf.write(str(output_file_path), signal, sample_rate)
    
    # Return conversion info
    return {
        "success": True,
        "outputPath": str(output_file_path),
        "durationSeconds": float(duration_seconds),
        "sampleRate": int(sample_rate),
        "tempoRatio": float(tempo_ratio),
        "pitchShiftSemitones": float(pitch_shift_semitones),
        "gainDb": float(gain_db),
    }


def main():
    parser = argparse.ArgumentParser(description="Convert audio with DSP effects")
    parser.add_argument("input_file", help="Path to input audio file")
    parser.add_argument("output_file", help="Path to output audio file")
    parser.add_argument("tempo_ratio", type=float, help="Tempo ratio (e.g., 1.2)")
    parser.add_argument(
        "pitch_shift_semitones", type=float, help="Pitch shift in semitones (e.g., 2)"
    )
    parser.add_argument("gain_db", type=float, help="Gain in dB (e.g., 3)")
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    output_path = Path(args.output_file)
    
    if not input_path.exists():
        raise FileNotFoundError(f"Audio file not found: {input_path}")
    
    result = convert_audio(
        input_path,
        output_path,
        args.tempo_ratio,
        args.pitch_shift_semitones,
        args.gain_db,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
