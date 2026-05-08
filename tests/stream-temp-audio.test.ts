import request from "supertest";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_WAV_CONTENT = Buffer.from("fake wav content");

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  stat: vi.fn(),
  createReadStream: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    writeFile: mocks.writeFile,
    unlink: mocks.unlink,
    access: mocks.access,
    stat: mocks.stat,
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
  analyzeAudio: vi.fn(),
  convertAudio: vi.fn(),
}));

import { app } from "../app";

describe("GET /api/stream-temp-audio/:filename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ size: FAKE_WAV_CONTENT.byteLength });
    mocks.createReadStream.mockImplementation(() => {
      const stream = new PassThrough();
      process.nextTick(() => {
        stream.end(FAKE_WAV_CONTENT);
      });
      return stream;
    });
  });

  it("returns 400 for URL-encoded path traversal sequences", async () => {
    // Raw `..` in the URL path is normalized by Express v5 routing before reaching the handler.
    // URL-encoded dots (%2E%2E) are decoded by Express into `..` and reach our explicit check.
    const response = await request(app).get(
      "/api/stream-temp-audio/%2E%2E%2Fetc%2Fpasswd",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid filename." });
  });

  it("returns 400 for filenames containing forward slashes", async () => {
    const response = await request(app).get(
      "/api/stream-temp-audio/subdir%2Ffile.wav",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid filename." });
  });

  it("returns 404 when the temp file does not exist", async () => {
    mocks.access.mockRejectedValue(new Error("ENOENT"));

    const response = await request(app).get(
      "/api/stream-temp-audio/converted-2026-01-01.wav",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: "Temporary audio file not found.",
    });
  });

  it("returns 200 with audio/wav content-type for a valid file", async () => {
    const response = await request(app).get(
      "/api/stream-temp-audio/converted-2026-01-01.wav",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/audio\/wav/);
    expect(response.headers["content-length"]).toBe(
      String(FAKE_WAV_CONTENT.byteLength),
    );
    expect(response.headers["accept-ranges"]).toBe("bytes");
  });

  it("calls createReadStream with the correct temp file path", async () => {
    await request(app).get("/api/stream-temp-audio/converted-2026-01-01.wav");

    expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
    const [calledPath] = mocks.createReadStream.mock.calls[0];
    expect(calledPath).toMatch(/converted-2026-01-01\.wav$/);
  });
});
