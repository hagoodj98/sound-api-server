// This test file is for testing the health check endpoint of the Sound DNA API server.
// It uses the supertest library to make HTTP requests to the server and the vitest testing framework for assertions.
import request from "supertest";
import { app } from "../app";
// Importing necessary modules and the Express app from the app.ts file.
import { describe, expect, it } from "vitest";

describe("Health Check", () => {
  it("should return a 200 status code and a greeting message", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Hello, Sound DNA API!");
  });
  it("should return a 404 status code for an unknown endpoint", async () => {
    const response = await request(app).get("/unknown");
    expect(response.status).toBe(404);
  });
});
