import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  convertAudio: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    writeFile: mocks.writeFile,
    unlink: mocks.unlink,
  },
  createReadStream: mocks.createReadStream,
}));

vi.mock("../lib/s3", () => ({
  s3Client: { send: vi.fn() },
}));

vi.mock("../lib/database", () => ({
  prisma: {
    soundProfile: { findUnique: vi.fn() },
    audioFile: { create: vi.fn() },
  },
}));

vi.mock("../pythonScript", () => ({
  analyzeAudio: mocks.analyzeAudio,
  convertAudio: mocks.convertAudio,
}));

import { app } from "../app";

describe("POST /api/reconvert-audio/:audioFileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.convertAudio.mockResolvedValue(undefined);
    mocks.analyzeAudio.mockResolvedValue({ tempoBpm: 100 });
  });

  const attach = (req: ReturnType<typeof request.post>) =>
    req.attach("audio", Buffer.from("fake audio"), {
      contentType: "audio/m4a",
      filename: "imported.m4a",
    });

  it("returns 400 when no audio file is uploaded", async () => {
    const response = await request(app).post(
      "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=0",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "No audio file uploaded." });
  });

  it("returns 400 when audioFileId is not a number", async () => {
    const response = await attach(
      request(app).post(
        "/api/reconvert-audio/abc?targetBPM=120&pitchShiftSemitones=0&gainDb=0",
      ),
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid audio file id." });
  });

  it("returns 400 when required query params are missing", async () => {
    const response = await attach(
      request(app).post("/api/reconvert-audio/1?targetBPM=120"),
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Missing or invalid/);
  });

  it("returns 200 with conversionPlan on success", async () => {
    const response = await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=2&gainDb=-3&importedTempoBpm=100",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Audio re-conversion complete.");
    expect(response.body.convertedAudioUri).toMatch(
      /^\/api\/stream-temp-audio\/reconverted-.*\.wav$/,
    );
    expect(response.body.conversionPlan).toMatchObject({
      targetBPM: 120,
      pitchShiftSemitones: 2,
      gainDb: -3,
    });
  });

  it("skips analyzeAudio when importedTempoBpm is provided", async () => {
    await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=0&importedTempoBpm=100",
      ),
    );

    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(mocks.convertAudio).toHaveBeenCalledTimes(1);
  });

  it("falls back to analyzeAudio when importedTempoBpm is not provided", async () => {
    await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=0",
      ),
    );

    expect(mocks.analyzeAudio).toHaveBeenCalledTimes(1);
    expect(mocks.convertAudio).toHaveBeenCalledTimes(1);
  });

  it("passes correct tempoRatio to convertAudio based on importedTempoBpm", async () => {
    // targetBPM 120, importedTempo 100 → ratio 1.20
    await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=0&importedTempoBpm=100",
      ),
    );

    const [, , tempoRatio] = mocks.convertAudio.mock.calls[0];
    expect(tempoRatio).toBeCloseTo(1.2, 5);
  });

  it("clamps pitchShiftSemitones to [-12, 12]", async () => {
    await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=99&gainDb=0&importedTempoBpm=100",
      ),
    );

    const [, , , pitchShift] = mocks.convertAudio.mock.calls[0];
    expect(pitchShift).toBe(12);
  });

  it("clamps gainDb to [-12, 12]", async () => {
    await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=-99&importedTempoBpm=100",
      ),
    );

    const [, , , , gainDb] = mocks.convertAudio.mock.calls[0];
    expect(gainDb).toBe(-12);
  });

  it("returns 500 when convertAudio throws", async () => {
    mocks.convertAudio.mockRejectedValue(new Error("dsp error"));

    const response = await attach(
      request(app).post(
        "/api/reconvert-audio/1?targetBPM=120&pitchShiftSemitones=0&gainDb=0&importedTempoBpm=100",
      ),
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Failed to reconvert audio file." });
  });
});
