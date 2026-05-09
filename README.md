# SonicDNA Server

Express + TypeScript API for SonicDNA audio upload, analysis metadata, and conversion endpoints.

## Tech Stack

- Node.js + Express
- TypeScript
- Prisma + PostgreSQL
- Cloudflare R2 (S3-compatible object storage)
- Python audio processing scripts (`librosa`-based flow in `python/`)

## Requirements

- Node.js 20+
- npm 10+
- Python 3.10+ (recommended)
- PostgreSQL database
- Cloudflare R2 credentials

## Environment Variables

Create a `.env` file in this folder with:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname

CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=<r2-access-key>
CLOUDFLARE_R2_SECRET_KEY=<r2-secret-key>
CLOUDFLARE_R2_BUCKET_NAME=<bucket-name>
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install Python dependencies:

```bash
npm run python:venv
npm run python:install
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run migrations:

```bash
npm run prisma:migrate:deploy
```

## Run the Server

Development mode:

```bash
npm run dev
```

Start mode:

```bash
npm run start
```

Default port is `3000`.

## Quality Commands

```bash
npm run lint
npm run typecheck
npm run test
```

## API Endpoints

### Health

- `GET /`

Returns greeting text:

- `Hello, SonicDNA!`

### Audio Ingest

- `POST /api/submit-audio`

Multipart form-data field:

- `audio` (file)

Uploads source audio, runs analysis, stores metadata in DB, and stores file in R2.

### Audio Catalog

- `GET /api/get-audio`

Returns available source audio metadata for app selection.

### Auto Conversion

- `POST /api/convert-audio/:audioFileId`

Multipart form-data field:

- `audio` (target/imported file)

Creates conversion plan from source profile + imported analysis and returns temporary stream URI.

### Stream Stored Audio

- `GET /api/stream-audio/:audioFileId`

Streams source audio file from R2.

### Stream Temporary Converted Audio

- `GET /api/stream-temp-audio/:filename`

Streams temporary converted WAV files from OS temp directory.

### Re-Conversion

- `POST /api/reconvert-audio/:audioFileId`

Multipart form-data field:

- `audio` (target/imported file)

Query params:

- `targetBPM`
- `pitchShiftSemitones`
- `gainDb`
- `importedTempoBpm` (optional)

Returns new temporary converted stream URI.

## Notes

- Filenames from React Native uploads are percent-decoded before processing.
- Converted audio is written to temporary files for preview streaming.
- Client app can cache converted output locally for iOS playback reliability.
