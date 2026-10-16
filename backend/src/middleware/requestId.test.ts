import { requestIdMiddleware } from "./requestId";

describe("requestIdMiddleware", () => {
  function response() {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as any;
  }

  it("echoes a client-supplied X-Request-ID", () => {
    const res = response();
    const next = jest.fn();
    requestIdMiddleware({ headers: { "x-request-id": "client-trace-123" } } as any, res, next);
    expect(res.headers["X-Request-ID"]).toBe("client-trace-123");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("generates a UUID v4 when the request has no ID", () => {
    const res = response();
    const next = jest.fn();
    requestIdMiddleware({ headers: {} } as any, res, next);
    expect(res.headers["X-Request-ID"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
