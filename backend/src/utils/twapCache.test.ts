import { getCachedTwapPrice, TWAP_CACHE_TTL_SECONDS, twapCacheKey } from "./twapCache";

describe("TWAP cache", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    jest.useRealTimers();
  });

  it("uses the twap:{asset} key and caches a miss", async () => {
    const fetchPrice = jest.fn().mockResolvedValue({ price: 123 });
    expect(twapCacheKey("XLM")).toBe("twap:XLM");
    await getCachedTwapPrice("XLM", fetchPrice);
    await getCachedTwapPrice("XLM", fetchPrice);
    expect(fetchPrice).toHaveBeenCalledTimes(1);
  });

  it("fetches again after the 60-second TTL expires", async () => {
    const fetchPrice = jest.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(101);
    await getCachedTwapPrice("USDC", fetchPrice);
    jest.advanceTimersByTime(TWAP_CACHE_TTL_SECONDS * 1000 + 1);
    await getCachedTwapPrice("USDC", fetchPrice);
    expect(fetchPrice).toHaveBeenCalledTimes(2);
  });
});
