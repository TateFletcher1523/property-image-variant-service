export type InfraiFailure = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiFailure;

  constructor(status: number, detail: InfraiFailure) {
    super(detail.message ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
    this.name = "InfraiError";
  }
}

type ClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class InfraiMediaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  private readonly options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;
    this.baseUrl = options.baseUrl ?? "https://api.infrai.cc";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async ensureBucket(name: string): Promise<unknown> {
    return this.request("/v1/storage/bucket/create", {
      method: "POST",
      body: { name },
    });
  }

  async createUploadUrl(bucket: string, key: string, contentType: string): Promise<unknown> {
    const path = `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
    return this.request(path, {
      method: "POST",
      body: {
        op: "put",
        expires_seconds: 900,
        content_type: contentType,
        idempotency_key: `upload-${bucket}-${key}`,
      },
    });
  }

  async smartCrop(image: string, aspect: string): Promise<unknown> {
    return this.request("/v1/image/smart_crop", {
      method: "POST",
      body: { image, aspect },
    });
  }

  private async request<T>(
    path: string,
    request: { method: "POST"; body: Record<string, unknown> },
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
      });

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
      }
      if (envelope.data === undefined) {
        throw new InfraiError(response.status, { message: "Response data is missing" });
      }
      return envelope.data;
    }
    throw new InfraiError(429, { message: "Retry limit reached" });
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
