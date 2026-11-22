export const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

/**
 * Shape of the subset of the Freighter API we rely on. The SDK is loaded
 * lazily so it is not part of the initial bundle.
 */
export interface FreighterApi {
  getPublicKey: () => Promise<unknown>;
  isConnected: () => Promise<unknown>;
  getNetworkDetails: () => Promise<unknown>;
}

let freighterModulePromise: Promise<FreighterApi | null> | null = null;

/**
 * Dynamically imports the Freighter SDK. The module is only fetched the first
 * time a wallet interaction is initiated; subsequent calls reuse the promise.
 * Returns null when the SDK cannot be loaded (e.g. not installed / SSR).
 */
export async function loadFreighter(): Promise<FreighterApi | null> {
  if (typeof window === "undefined") return null;
  if (!freighterModulePromise) {
    freighterModulePromise = import("@stellar/freighter-api")
      .then((mod) => mod as unknown as FreighterApi)
      .catch(() => {
        // Allow a later retry if the import failed transiently.
        freighterModulePromise = null;
        return null;
      });
  }
  return freighterModulePromise;
}

export const EXPECTED_NETWORK = "TESTNET";

export type WalletConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "not-installed"
  | "wrong-network"
  | "error";

export interface WalletConnectionState {
  status: WalletConnectionStatus;
  address: string | null;
  network: string | null;
  message: string;
  installUrl?: string;
}

export const initialWalletState: WalletConnectionState = {
  status: "idle",
  address: null,
  network: null,
  message: "",
};

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to failure
  }
  return false;
}

function isFreighterAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as { freighter?: unknown; freighterApi?: unknown };
  return Boolean(win.freighter || win.freighterApi);
}

export async function connectWallet(): Promise<WalletConnectionState> {
  if (!isFreighterAvailable()) {
    return {
      status: "not-installed",
      address: null,
      network: null,
      message:
        "Freighter wallet was not detected. Install the Freighter extension to connect your Stellar wallet.",
      installUrl: FREIGHTER_INSTALL_URL,
    };
  }

  try {
    const freighter = await loadFreighter();
    if (!freighter) {
      return {
        status: "not-installed",
        address: null,
        network: null,
        message:
          "Freighter wallet was not detected. Install the Freighter extension to connect your Stellar wallet.",
        installUrl: FREIGHTER_INSTALL_URL,
      };
    }

    const connected = await freighter.isConnected();
    if (!connected || (typeof connected === "object" && !connected.isConnected)) {
      return {
        status: "error",
        address: null,
        network: null,
        message: "Freighter is installed but not connected. Open the extension and try again.",
      };
    }

    const networkDetails = await freighter.getNetworkDetails();
    const network =
      typeof networkDetails === "object" && networkDetails !== null
        ? (networkDetails as { network?: string }).network ?? null
        : null;

    if (network && network.toUpperCase() !== EXPECTED_NETWORK) {
      return {
        status: "wrong-network",
        address: null,
        network,
        message: `Wrong network detected (${network}). Switch Freighter to ${EXPECTED_NETWORK} and reconnect.`,
      };
    }

    const publicKey = await freighter.getPublicKey();
    const address =
      typeof publicKey === "string"
        ? publicKey
        : (publicKey as { publicKey?: string })?.publicKey ?? null;

    if (!address) {
      return {
        status: "error",
        address: null,
        network,
        message: "Unable to retrieve your wallet address. Please approve the connection in Freighter.",
      };
    }

    return {
      status: "connected",
      address,
      network,
      message: "Wallet connected successfully.",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return {
      status: "error",
      address: null,
      network: null,
      message: `Wallet connection failed: ${detail}`,
    };
  }
}

export interface WalletStatusSnapshot {
  isConnected: boolean;
  address: string | null;
  network: string | null;
}

/**
 * Reads the current wallet status from Freighter. Returns null when the SDK
 * cannot be loaded or the extension is unavailable.
 */
export async function getWalletStatus(): Promise<WalletStatusSnapshot | null> {
  const freighter = await loadFreighter();
  if (!freighter) return null;

  try {
    const connected = await freighter.isConnected();
    const isConn =
      typeof connected === "boolean"
        ? connected
        : Boolean((connected as { isConnected?: boolean } | null)?.isConnected);

    if (!isConn) {
      return { isConnected: false, address: null, network: null };
    }

    const networkDetails = await freighter.getNetworkDetails();
    const network =
      typeof networkDetails === "object" && networkDetails !== null
        ? (networkDetails as { network?: string }).network ?? null
        : null;

    const publicKey = await freighter.getPublicKey();
    const address =
      typeof publicKey === "string"
        ? publicKey
        : (publicKey as { publicKey?: string })?.publicKey ?? null;

    return { isConnected: Boolean(address), address, network };
  } catch {
    return { isConnected: false, address: null, network: null };
  }
}

/**
 * Polls Freighter for connection/network changes and invokes `onChange` with
 * the latest snapshot. Returns a cleanup function that stops polling.
 */
export function pollWalletStatus(
  onChange: (snapshot: WalletStatusSnapshot | null) => void,
  intervalMs = 3000,
): () => void {
  if (typeof window === "undefined") return () => {};

  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (!active) return;
    const snapshot = await getWalletStatus();
    if (!active) return;
    onChange(snapshot);
    if (active) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  void tick();

  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
