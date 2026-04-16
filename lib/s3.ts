import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

export const s3Client = new S3Client({
  region: "auto", // Set the region to "auto" for Cloudflare R2
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT, // Use the Cloudflare R2 endpoint from environment variables
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!, // Use the Cloudflare R2 access key from environment variables
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!, // Use the Cloudflare R2 secret key from environment variables
  },
});
