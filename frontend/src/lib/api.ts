const API_BASE = "/api";

let currentWalletAddress: string | null = null;

function normalizeAddress(address: string | null): string | null {
  if (!address) return null;
  const lower = address.toLowerCase().trim();
  return lower.startsWith("0x") ? lower : `0x${lower}`;
}

export function setCurrentWalletAddress(address: string | null) {
  currentWalletAddress = normalizeAddress(address);
}

function getAuthHeaders(): Record<string, string> {
  if (!currentWalletAddress) return {};
  return {
    "X-Sui-Address": currentWalletAddress,
    "X-User-Email": currentWalletAddress,
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

const FRIENDLY_FALLBACK: Record<number, string> = {
  400: "That didn't quite work. Double-check the details and try again.",
  401: "You're not signed in. Sign in to continue.",
  403: "You don't have access to that.",
  404: "We couldn't find what you were looking for.",
  409: "That name is already taken. Try a different one.",
  413: "That file is too big.",
  429: "Slow down a bit — too many requests. Try again in a moment.",
  500: "Something broke on our end. Try again in a moment.",
  502: "Our server is having a moment. Try again shortly.",
  503: "We're doing some quick maintenance. Try again in a bit.",
};

function friendlyMessage(status: number, fallback?: string): string {
  if (fallback && fallback.length > 0 && fallback.length < 200) return fallback;
  return FRIENDLY_FALLBACK[status] || "Something went wrong. Please try again.";
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: string; code?: string } = {};
  try {
    const text = await res.text();
    if (text) body = JSON.parse(text);
  } catch {
    // non-JSON body; ignore
  }
  return new ApiError(friendlyMessage(res.status, body.error), res.status, body.code);
}

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
  } catch {
    throw new ApiError(
      "Can't reach Antroph right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Can't reach Antroph right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Can't reach Antroph right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * Stream a POST request as SSE.
 * Calls onDelta(token) for each streamed text chunk.
 * Calls onDone(session_id, title) when the server sends { done: true }.
 * Throws ApiError on network or server errors.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onDelta: (token: string) => void,
  onDone: (sessionId: string, title: string | null) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Can't reach Antroph right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new ApiError("No response body", 0);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE lines: "data: {...}\n\n"
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";

    for (const event of events) {
      consumeEvent(event, onDelta, onDone);
    }
  }

  if (buf.trim()) consumeEvent(buf, onDelta, onDone);
}

function consumeEvent(
  event: string,
  onDelta: (token: string) => void,
  onDone: (sessionId: string, title: string | null) => void
) {
  const line = event.trim();
  if (!line.startsWith("data:")) return;
  try {
    const data = JSON.parse(line.slice(5).trim());
    if (data.error) throw new ApiError(data.error, 500);
    if (data.delta) onDelta(data.delta);
    if (data.done) onDone(data.session_id ?? "", data.title ?? null);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // malformed chunk — skip
  }
}

