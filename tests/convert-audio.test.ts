import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  convertAudio: vi.fn(),
  soundProfileFindUnique: vi.fn(),
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
    soundProfile: { findUnique: mocks.soundProfileFindUnique },
    audioFile: { create: vi.fn() },
  },
}));

vi.mock("../pythonScript", () => ({
  analyzeAudio: mocks.analyzeAudio,
  convertAudio: mocks.convertAudio,
}));

import { app } from "../app";

const FAKE_RAW_ANALYSIS = {
  fileName: "profile.m4a",
  durationSeconds: 3.0,
  sampleRate: 44100,
  tempoBpm: 120,
  estimatedPitchHz: 440,
  dna: {
    mfccMean: [0.1],
    mfccStd: [0.01],
    chromaMean: [0.3],
    spectralCentroidMean: 1000,
    spectralBandwidthMean: 300,
    spectralRolloffMean: 2000,
    zeroCrossingRateMean: 0.05,
    rmsMean: 0.2,
  },
};

describe("POST /api/convert-audio/:audioFileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.convertAudio.mockResolvedValue(undefined);
    mocks.analyzeAudio.mockResolvedValue({
      ...FAKE_RAW_ANALYSIS,
      fileName: "imported.m4a",
      tempoBpm: 100,
      estimatedPitchHz: 440,
      dna: { ...FAKE_RAW_ANALYSIS.dna, rmsMean: 0.2 },
    });
    mocks.soundProfileFindUnique.mockResolvedValue({
      audioFileId: 1,
      rawAnalysis: FAKE_RAW_ANALYSIS,
    });
  });

  it("returns 400 when no audio file is uploaded", async () => {
    const response = await request(app).post("/api/convert-audio/1");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "No audio file uploaded." });
    expect(mocks.soundProfileFindUnique).not.toHaveBeenCalled();
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(mocks.convertAudio).not.toHaveBeenCalled();
  });

  it("returns 404 when no sound profile exists for the given id", async () => {
    mocks.soundProfileFindUnique.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/convert-audio/999")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "imported.m4a",
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Audio file not found." });
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(mocks.convertAudio).not.toHaveBeenCalled();
  });

  it("returns 200 with conversionPlan on successful conversion", async () => {
    const response = await request(app)
      .post("/api/convert-audio/1")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "imported.m4a",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Audio conversion complete. DSP effects applied and file processed.",
    );
    expect(response.body.convertedAudioUri).toMatch(
      /^\/api\/stream-temp-audio\/converted-.*\.wav$/,
    );
    expect(response.body.conversionPlan).toMatchObject({
      targetBPM: 120,
      importedTempoBpm: 100,
      pitchShiftSemitones: expect.any(Number),
      gainDb: expect.any(Number),
    });
  });

  it("writes, analyzes, and converts the uploaded file", async () => {
    await request(app)
      .post("/api/convert-audio/1")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "imported.m4a",
      });

    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeAudio).toHaveBeenCalledTimes(1);
    expect(mocks.convertAudio).toHaveBeenCalledTimes(1);
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when convertAudio throws", async () => {
    mocks.convertAudio.mockRejectedValue(new Error("python crash"));

    const response = await request(app)
      .post("/api/convert-audio/1")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "imported.m4a",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Failed to apply audio transformations.",
    });
  });

  it("clamps tempoRatio between 0.75 and 1.25", async () => {
    // Profile at 200 BPM, imported at 100 BPM → raw ratio 2.0 → clamped to 1.25
    mocks.soundProfileFindUnique.mockResolvedValue({
      audioFileId: 1,
      rawAnalysis: { ...FAKE_RAW_ANALYSIS, tempoBpm: 200 },
    });
    mocks.analyzeAudio.mockResolvedValue({
      ...FAKE_RAW_ANALYSIS,
      tempoBpm: 100,
    });

    await request(app)
      .post("/api/convert-audio/1")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "imported.m4a",
      });

    const [, , tempoRatio] = mocks.convertAudio.mock.calls[0];
    expect(tempoRatio).toBe(1.25);
  });
});
