import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  audioFileCreate: vi.fn(),
  soundProfileCreate: vi.fn(),
  s3Send: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    writeFile: mocks.writeFile,
    unlink: mocks.unlink,
  },
}));

vi.mock("../lib/s3", () => ({
  s3Client: {
    send: mocks.s3Send,
  },
}));

vi.mock("../lib/database", () => ({
  prisma: {
    audioFile: {
      create: mocks.audioFileCreate,
    },
    soundProfile: {
      create: mocks.soundProfileCreate,
    },
  },
}));

vi.mock("../pythonScript", () => ({
  analyzeAudio: mocks.analyzeAudio,
}));

import { app } from "../app";

describe("POST /api/submit-audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.s3Send.mockResolvedValue({});
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.analyzeAudio.mockResolvedValue({
      fileName: "recording.m4a",
      durationSeconds: 1.23,
      sampleRate: 44100,
      tempoBpm: 120,
      estimatedPitchHz: 440,
      dna: {
        mfccMean: [0.1, 0.2],
        mfccStd: [0.01, 0.02],
        chromaMean: [0.3, 0.4],
        spectralCentroidMean: 1000,
        spectralBandwidthMean: 300,
        spectralRolloffMean: 2000,
        zeroCrossingRateMean: 0.05,
        rmsMean: 0.2,
      },
    });
    mocks.audioFileCreate.mockResolvedValue({ id: 1 });
    mocks.soundProfileCreate.mockResolvedValue({ id: 10, audioFileId: 1 });
  });

  it("returns 400 when no audio file is uploaded", async () => {
    const response = await request(app).post("/api/submit-audio");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "No audio file uploaded." });
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(mocks.audioFileCreate).not.toHaveBeenCalled();
    expect(mocks.soundProfileCreate).not.toHaveBeenCalled();
  });

  it("uploads audio, analyzes it, and stores both database records", async () => {
    const response = await request(app)
      .post("/api/submit-audio")
      .attach("audio", Buffer.from("fake audio"), {
        contentType: "audio/m4a",
        filename: "recording.m4a",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Audio submitted successfully!" });
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeAudio).toHaveBeenCalledTimes(1);
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
    expect(mocks.audioFileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fileName: "recording.m4a",
        mimeType: "audio/m4a",
        size: 10,
        storageKey: expect.stringMatching(/^audio\/.*-recording\.m4a$/),
      }),
    });
    expect(mocks.soundProfileCreate).toHaveBeenCalledWith({
      data: {
        audioFileId: 1,
        durationSeconds: 1.23,
        tempoBpm: 120,
        estimatedPitchHz: 440,
        rmsMean: 0.2,
        spectralCentroidMean: 1000,
        spectralRolloffMean: 2000,
        spectralBandwidthMean: 300,
        zeroCrossingRateMean: 0.05,
        mfccMean: [0.1, 0.2],
        mfccStd: [0.01, 0.02],
        chromaMean: [0.3, 0.4],
        rawAnalysis: {
          fileName: "recording.m4a",
          durationSeconds: 1.23,
          sampleRate: 44100,
          tempoBpm: 120,
          estimatedPitchHz: 440,
          dna: {
            mfccMean: [0.1, 0.2],
            mfccStd: [0.01, 0.02],
            chromaMean: [0.3, 0.4],
            spectralCentroidMean: 1000,
            spectralBandwidthMean: 300,
            spectralRolloffMean: 2000,
            zeroCrossingRateMean: 0.05,
            rmsMean: 0.2,
          },
        },
      },
    });
  });
});
