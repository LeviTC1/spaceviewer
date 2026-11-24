import { describe, expect, it } from "vitest";
import { filterStarCatalogView, type StarCatalogFilterChunkInput } from "../src/lib/catalog/starCatalogFilter";

const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

const chunk = (
  chunkId: string,
  magnitudes: number[],
  positions = magnitudes.flatMap(() => [0, 0, 0]),
): StarCatalogFilterChunkInput => ({
  chunkId,
  apparentMagnitudeG: new Float32Array(magnitudes),
  renderPositions: new Float32Array(positions),
});

describe("star catalogue view filtering", () => {
  it("applies a global bright-first point budget across magnitude-sorted chunks", () => {
    const result = filterStarCatalogView(
      [chunk("a", [1, 4, 7]), chunk("b", [2, 3, 5])],
      {
        viewProjectionMatrix: IDENTITY_MATRIX,
        positionScale: 1,
        magnitudeLimitG: 5,
        pointBudget: 3,
      },
    );

    expect([...result.chunks[0].indices]).toEqual([0]);
    expect([...result.chunks[1].indices]).toEqual([0, 1]);
    expect(result.diagnostics).toMatchObject({
      totalRecords: 6,
      magnitudeEligibleRecords: 5,
      frustumVisibleRecords: 5,
      renderedRecords: 3,
      magnitudeCulledRecords: 1,
      frustumCulledRecords: 0,
      budgetCulledRecords: 2,
      magnitudeLimitG: 5,
      pointBudget: 3,
      frustumPadding: 1.08,
    });
  });

  it("culls records outside the padded clip frustum before applying the budget", () => {
    const result = filterStarCatalogView(
      [chunk("view", [1, 2, 3], [0, 0, 0, 1.05, 0, 0, 1.2, 0, 0])],
      {
        viewProjectionMatrix: IDENTITY_MATRIX,
        positionScale: 1,
        magnitudeLimitG: 3,
        pointBudget: 10,
      },
    );

    expect([...result.chunks[0].indices]).toEqual([0, 1]);
    expect(result.diagnostics.frustumVisibleRecords).toBe(2);
    expect(result.diagnostics.frustumCulledRecords).toBe(1);
  });

  it("reports magnitude eligibility independently from frustum visibility", () => {
    const result = filterStarCatalogView(
      [chunk("magnitude", [2, 6, Number.NaN])],
      {
        viewProjectionMatrix: IDENTITY_MATRIX,
        positionScale: 1,
        magnitudeLimitG: 5,
        pointBudget: Number.POSITIVE_INFINITY,
      },
    );

    expect(result.chunks[0].magnitudeEligibleRecords).toBe(1);
    expect(result.diagnostics.magnitudeCulledRecords).toBe(2);
    expect(result.diagnostics.renderedRecords).toBe(1);
  });

  it("rejects malformed matrices and unsafe frustum padding", () => {
    expect(() => filterStarCatalogView([], {
      viewProjectionMatrix: [1, 2, 3],
      positionScale: 1,
      magnitudeLimitG: 9,
      pointBudget: 100,
    })).toThrow(/4x4/);
    expect(() => filterStarCatalogView([], {
      viewProjectionMatrix: IDENTITY_MATRIX,
      positionScale: 1,
      magnitudeLimitG: 9,
      pointBudget: 100,
      frustumPadding: 2.1,
    })).toThrow(/padding/);
  });
});
