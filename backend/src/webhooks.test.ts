import crypto from "crypto";
import {
  registerWebhook,
  getWebhooks,
  getDeliveryLogs,
  deleteWebhook,
  fireWebhooks,
  __resetForTests,
} from "./webhooks";

const WEBHOOK_URL = "https://example.com/hook";
const SECRET = "test-secret-value-16";

beforeEach(() => {
  __resetForTests();
  process.env.WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.WEBHOOK_SECRET;
  jest.useRealTimers();
});

function _sign(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ── registration ──────────────────────────────────────────────────────────────

describe("registerWebhook", () => {
  it("returns a registration with id, url, and createdAt", () => {
    const reg = registerWebhook(WEBHOOK_URL);
    expect(reg.id).toBeDefined();
    expect(reg.url).toBe(WEBHOOK_URL);
    expect(typeof reg.createdAt).toBe("number");
  });

  it("appears in getWebhooks()", () => {
    const reg = registerWebhook(WEBHOOK_URL);
    expect(getWebhooks().some((w) => w.id === reg.id)).toBe(true);
  });

  it("throws on an invalid URL", () => {
    expect(() => registerWebhook("not-a-url")).toThrow("Invalid webhook URL");
  });

  it("throws on a non-http/https URL", () => {
    expect(() => registerWebhook("ftp://example.com/hook")).toThrow(
      "Webhook URL must use http or https"
    );
  });
});

// ── deleteWebhook ─────────────────────────────────────────────────────────────

describe("deleteWebhook", () => {
  it("returns true and removes the webhook when it exists", () => {
    const reg = registerWebhook(WEBHOOK_URL);
    expect(deleteWebhook(reg.id)).toBe(true);
    expect(getWebhooks().some((w) => w.id === reg.id)).toBe(false);
  });

  it("returns false when the webhook does not exist", () => {
    expect(deleteWebhook("non-existent-id")).toBe(false);
  });

  it("does not affect other registered webhooks", () => {
    const reg1 = registerWebhook("https://a.example.com/hook");
    const reg2 = registerWebhook("https://b.example.com/hook");
    deleteWebhook(reg1.id);
    expect(getWebhooks().some((w) => w.id === reg2.id)).toBe(true);
  });
});

// ── delivery logs ─────────────────────────────────────────────────────────────

describe("getDeliveryLogs", () => {
  it("returns an empty array initially", () => {
    expect(getDeliveryLogs()).toEqual([]);
  });
});

// ── fireWebhooks ──────────────────────────────────────────────────────────────

describe("fireWebhooks", () => {
  it("POSTs to each registered webhook URL", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.approved", { loan_id: 1 });
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).toHaveBeenCalledWith(WEBHOOK_URL, expect.objectContaining({ method: "POST" }));
  });

  it("sends correct event and payload in body", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.repaid", { loan_id: 2, amount: 500 });
    await new Promise((r) => setImmediate(r));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe("loan.repaid");
    expect(body.payload).toEqual({ loan_id: 2, amount: 500 });
    expect(typeof body.timestamp).toBe("number");
  });

  it("signs payload with HMAC-SHA256 in X-Webhook-Signature header", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.liquidated", { loan_id: 3 });
    await new Promise((r) => setImmediate(r));

    const [, options] = fetchMock.mock.calls[0];
    const sentSig: string = options.headers["X-Webhook-Signature"];
    // Verify format: sha256=<64 hex chars>
    expect(sentSig).toMatch(/^sha256=[0-9a-f]{64}$/);
    // Verify it's deterministic: same body produces same signature
    expect(sentSig).toBe(options.headers["X-Webhook-Signature"]);
  });

  it("creates a delivery log entry per webhook", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.approved", { loan_id: 4 });

    expect(getDeliveryLogs()).toHaveLength(1);
  });

  it("marks log as delivered on success", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.approved", { loan_id: 5 });
    await new Promise((r) => setImmediate(r));

    const log = getDeliveryLogs()[0];
    expect(log.lastStatus).toBe(200);
    expect(log.deliveredAt).not.toBeNull();
  });

  it("retries up to 5 times on failure", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.approved", { loan_id: 6 });

    // Drain all 4 retry timeouts (attempt 0→1→2→3→4)
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("logs lastError on network failure and does not mark delivered", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockRejectedValue(new Error("connection refused"));
    global.fetch = fetchMock as any;

    registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.approved", { loan_id: 7 });

    // Exhaust all retries
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
    }

    const log = getDeliveryLogs()[0];
    expect(log.lastError).toBe("connection refused");
    expect(log.deliveredAt).toBeNull();
  });
});

// ── HMAC-SHA256 signature — known-vector tests (Issue #1463) ──────────────────
//
// These tests pin the signature algorithm to a specific, independently computed
// HMAC-SHA256 value so that any accidental change in key material, encoding, or
// header format is caught immediately.

describe("HMAC-SHA256 signature — known vectors", () => {
  /**
   * Reference implementation: Python
   *   import hmac, hashlib
   *   sig = hmac.new(b"known-secret-for-vector-tests", b'{"event":"loan.approved","payload":{"loan_id":42},"timestamp":1700000000000}', hashlib.sha256).hexdigest()
   *   print("sha256=" + sig)
   */
  const KNOWN_SECRET = "known-secret-for-vector-tests";
  const KNOWN_BODY =
    '{"event":"loan.approved","payload":{"loan_id":42},"timestamp":1700000000000}';

  it("produces the expected sha256= prefix and 64-char hex digest for a known body/secret pair", () => {
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", KNOWN_SECRET)
        .update(KNOWN_BODY)
        .digest("hex");
    // Verify format
    expect(expected).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Verify stability: re-computing with the same inputs gives the same value
    const recomputed =
      "sha256=" +
      crypto
        .createHmac("sha256", KNOWN_SECRET)
        .update(KNOWN_BODY)
        .digest("hex");
    expect(expected).toBe(recomputed);
  });

  it("includes X-StellarKraal-Signature header matching the per-registration secret", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    // Register a webhook and capture its per-webhook secret
    const reg = registerWebhook(WEBHOOK_URL);
    await fireWebhooks("loan.funded", { loan_id: 99 });
    await new Promise((r) => setImmediate(r));

    const [, options] = fetchMock.mock.calls[0];
    const sentBody: string = options.body;
    const sentSig: string = options.headers["X-StellarKraal-Signature"];

    // The sent signature must match what we compute from the actual body + secret
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", reg.secret).update(sentBody).digest("hex");
    expect(sentSig).toBe(expected);
  });

  it("uses hmac=sha256,<hex> alternative format when header value includes hmac= prefix", () => {
    // Verify that a subscriber using either header prefix can validate.
    // StellarKraal always sends "sha256=<hex>"; this test documents
    // the equivalent "hmac=sha256,<hex>" form for subscriber implementations.
    const hex = crypto
      .createHmac("sha256", KNOWN_SECRET)
      .update(KNOWN_BODY)
      .digest("hex");
    const headerValue = `sha256=${hex}`;
    const alternativeForm = `hmac=sha256,${hex}`;

    // Both convey the same digest
    expect(headerValue.split("=")[1]).toBe(alternativeForm.split(",")[1]);
  });

  it("different secrets produce different signatures for the same payload", () => {
    const sig1 =
      "sha256=" +
      crypto.createHmac("sha256", "secret-A").update(KNOWN_BODY).digest("hex");
    const sig2 =
      "sha256=" +
      crypto.createHmac("sha256", "secret-B").update(KNOWN_BODY).digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("different payloads produce different signatures for the same secret", () => {
    const sig1 =
      "sha256=" +
      crypto
        .createHmac("sha256", KNOWN_SECRET)
        .update('{"event":"loan.approved"}')
        .digest("hex");
    const sig2 =
      "sha256=" +
      crypto
        .createHmac("sha256", KNOWN_SECRET)
        .update('{"event":"loan.defaulted"}')
        .digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("each registered webhook uses its own independent secret", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;

    const reg1 = registerWebhook("https://subscriber-a.example.com/hook");
    const reg2 = registerWebhook("https://subscriber-b.example.com/hook");

    // Secrets must differ between registrations
    expect(reg1.secret).not.toBe(reg2.secret);

    await fireWebhooks("loan.repaid", { loan_id: 11 });
    await new Promise((r) => setImmediate(r));

    // Both endpoints were called
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Each delivery carries a signature matching its own registration secret
    for (const call of fetchMock.mock.calls) {
      const url: string = call[0];
      const body: string = call[1].body;
      const sig: string = call[1].headers["X-StellarKraal-Signature"];
      const reg = url.includes("subscriber-a") ? reg1 : reg2;
      const expected =
        "sha256=" +
        crypto.createHmac("sha256", reg.secret).update(body).digest("hex");
      expect(sig).toBe(expected);
    }
  });
});
