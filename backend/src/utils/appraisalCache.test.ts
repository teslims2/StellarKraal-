import {
  getAppraisal,
  setAppraisal,
  invalidateAppraisal,
  invalidateAll,
  configureCacheTTL,
  _cacheSize,
} from "./appraisalCache";

// Silence logger output during tests
jest.mock("./logger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  invalidateAll();
  configureCacheTTL(5 * 60 * 1000);
});

describe("appraisalCache", () => {
  it("returns null on cache miss", () => {
    expect(getAppraisal("col-1")).toBeNull();
  });

  it("returns cached value on hit", () => {
    setAppraisal("col-1", 1000);
    const entry = getAppraisal("col-1");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe(1000);
    expect(entry!.stale).toBe(false);
  });

  it("flags entry as stale when TTL has elapsed", () => {
    configureCacheTTL(1); // 1 ms TTL
    setAppraisal("col-2", 500);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const entry = getAppraisal("col-2");
        expect(entry).not.toBeNull();
        expect(entry!.stale).toBe(true);
        resolve();
      }, 10);
    });
  });

  it("invalidates a specific entry", () => {
    setAppraisal("col-3", 200);
    invalidateAppraisal("col-3");
    expect(getAppraisal("col-3")).toBeNull();
  });

  it("invalidateAll clears all entries", () => {
    setAppraisal("col-4", 100);
    setAppraisal("col-5", 200);
    invalidateAll();
    expect(_cacheSize()).toBe(0);
  });

  it("does not throw when invalidating a non-existent key", () => {
    expect(() => invalidateAppraisal("does-not-exist")).not.toThrow();
  });
});
