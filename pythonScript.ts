import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
// Promisify the execFile function to use async/await syntax
const execFileAsync = promisify(execFile); //
// This function runs the analyze_audio.py Python script with the provided audio file path and returns the analysis results
export async function analyzeAudio(filePath: string) {
  if (!filePath) {
    throw new Error("analyzeAudio requires a valid audio file path");
  }

  // Determine the path to the Python executable based on the operating system
  const pythonBin =
    process.platform === "win32"
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python");
  // Construct the path to the analyze_audio.py script located in the python directory of the project
  const scriptPath = path.join(process.cwd(), "python", "analyze_audio.py"); // Execute the Python script with the audio file path as an argument and capture the standard output and error
  // The Python script is expected to perform audio analysis and return the results in JSON format through standard output
  const { stdout } = await execFileAsync(pythonBin, [scriptPath, filePath]);

  return JSON.parse(stdout); // Assuming the Python script returns JSON output
}

// This function runs the convert_audio.py Python script to apply DSP effects (time-stretch, pitch-shift, gain)
export async function convertAudio(
  inputFilePath: string,
  outputFilePath: string,
  tempoRatio: number,
  pitchShiftSemitones: number,
  gainDb: number,
) {
  if (!inputFilePath || !outputFilePath) {
    throw new Error("convertAudio requires valid input and output file paths");
  }

  // Determine the path to the Python executable based on the operating system
  const pythonBin =
    process.platform === "win32"
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python");
  // Construct the path to the convert_audio.py script located in the python directory of the project
  const scriptPath = path.join(process.cwd(), "python", "convert_audio.py");
  // Execute the Python script with the audio file paths and conversion parameters
  //stdout stands for standard output (the normal output of the script), while stderr stands for standard error (where error messages and warnings are sent). Even if the conversion is successful, some Python libraries may output warnings to stderr, which is why we check and log it separately.
  const { stdout } = await execFileAsync(pythonBin, [
    scriptPath,
    inputFilePath,
    outputFilePath,
    tempoRatio.toString(),
    pitchShiftSemitones.toString(),
    gainDb.toString(),
  ]);

  return JSON.parse(stdout); // Assuming the Python script returns JSON output
}
