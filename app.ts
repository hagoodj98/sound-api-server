import cors from "cors";
import express from "express";
import multer from "multer";
export const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  console.log(req.url);

  res.send("Hello, Sound DNA API!");
});
const temptStorage = multer.memoryStorage(); // Use memory storage for multer to store uploaded files in memory
const upload = multer({ storage: temptStorage }); // Create a multer instance with the memory storage configuration
app.post("/api/submit-audio", upload.single("audio"), (req, res) => {
  console.log(req); // Log the uploaded file information for debugging purposes
  try {
    const audioFile = req.file; // Get the uploaded audio file from the request
    console.log(audioFile);
  } catch (error) {
    console.error(error);
  }
  // Here you can implement the logic to process the submitted audio URI as needed
  res.status(200).json({ message: "Audio submitted successfully!" }); // Respond with a success message
});
