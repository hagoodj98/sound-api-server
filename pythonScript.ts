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
  const { stdout, stderr } = await execFileAsync(pythonBin, [
    scriptPath,
    filePath,
  ]);
  // Warnings from Python libraries can appear on stderr even when the analysis succeeds.
  if (stderr) {
    console.warn("Python analysis warning:", stderr);
  }

  return JSON.parse(stdout); // Assuming the Python script returns JSON output
}
