import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { pool } from "../src/db/db.js";
import {
  buildProductReviewedEvent,
  publishProductReview,
} from "../src/clients/kafka.js";
import { app } from "../src/server.js";

vi.mock("../src/db/db.js", () => ({
  createProductTable: vi.fn().mockResolvedValue(undefined),
  pool: { query: vi.fn() },
}));

vi.mock("../src/clients/kafka.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishProductReview: vi.fn().mockResolvedValue({}),
  };
});

const sampleRow = {
  id: "03498f3b-004a-4b6e-a6c8-328af500e3b5",
  name: "Café au Lait Magnum Pack",
  price: "8.3500",
  value: 4.1,
  in_stock: true,
  reviewed: false,
  updated_at: "2026-04-24T13:43:05.611Z",
};

describe("buildProductReviewedEvent (Kafka envelope)", () => {
  it("includes type, source, reviewed_at, and five payload fields", () => {
    const reviewedAt = "2024-03-15T10:30:00.000Z";
    const event = buildProductReviewedEvent(
      {
        id: "abc-123",
        name: "Test",
        price: 8.35,
        value: 4.1,
        inStock: true,
      },
      reviewedAt
    );
    expect(event).toEqual({
      type: "product.reviewed",
      source: "product-review-api",
      reviewed_at: reviewedAt,
      payload: {
        id: "abc-123",
        name: "Test",
        price: 8.35,
        value: 4.1,
        inStock: true,
      },
    });
  });
});

describe("POST /productreviewed/:id (review + Kafka trigger)", () => {
  const query = vi.mocked(pool.query);
  const publish = vi.mocked(publishProductReview);

  beforeEach(() => {
    query.mockReset();
    publish.mockClear();
    publish.mockResolvedValue({});
  });

  it("returns 200, updates flow, and calls publishProductReview with simplified product + ISO time", async () => {
    query
      .mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await request(app).post(
      "/productreviewed/03498f3b-004a-4b6e-a6c8-328af500e3b5"
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product marked as reviewed");
    expect(res.body.product.id).toBe(sampleRow.id);
    expect(publish).toHaveBeenCalledTimes(1);
    const [simplified, reviewedAt] = publish.mock.calls[0];
    expect(simplified).toMatchObject({
      id: sampleRow.id,
      name: sampleRow.name,
      price: 8.35,
      value: 4.1,
      inStock: true,
    });
    expect(reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 404 when product does not exist", async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post(
      "/productreviewed/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status).toBe(404);
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns 409 when already reviewed and does not publish", async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          { id: sampleRow.id, name: sampleRow.name, reviewed: true },
        ],
        rowCount: 1,
      });

    const res = await request(app).post(
      `/productreviewed/${sampleRow.id}`
    );
    expect(res.status).toBe(409);
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns 503 and rolls back when Kafka publish fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    publish.mockRejectedValueOnce(new Error("broker down"));
    query
      .mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await request(app).post(
      `/productreviewed/${sampleRow.id}`
    );
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/rolled back/);
    expect(publish).toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
    errSpy.mockRestore();
  });
});
