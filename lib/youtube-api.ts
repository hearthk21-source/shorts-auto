type YouTubeApiErrorPayload = {
  error?: {
    errors?: Array<{ reason?: string }>;
  };
};

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

const reasonMessages: Record<string, string> = {
  keyInvalid: "YouTube API 키가 유효하지 않습니다.",
  quotaExceeded: "YouTube API의 오늘 사용 할당량이 소진되었습니다.",
  commentsDisabled: "이 영상은 댓글이 비활성화되어 있습니다.",
  accessNotConfigured: "Google Cloud에서 YouTube Data API v3를 활성화해야 합니다.",
  forbidden: "YouTube API 접근이 거부되었습니다. 키 제한 설정을 확인해 주세요."
};

export async function youtubeGet<T>(
  resource: "search" | "videos" | "commentThreads",
  parameters: Record<string, string>
): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeApiError(
      "YouTube 수집을 시작하려면 Vercel의 서버 환경변수 YOUTUBE_API_KEY 설정이 필요합니다.",
      503,
      "keyMissing"
    );
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  url.searchParams.set("key", key);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as YouTubeApiErrorPayload;
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason;
    const message = reasonMessages[reason ?? ""] ?? "YouTube API 요청에 실패했습니다. API 설정과 사용 할당량을 확인해 주세요.";
    throw new YouTubeApiError(message, response.status, reason);
  }

  return payload as T;
}

export function youtubeErrorResponse(error: unknown): Response {
  if (error instanceof YouTubeApiError) {
    const status = error.reason === "quotaExceeded" ? 429 : error.status;
    return Response.json({ error: error.message, reason: error.reason }, { status });
  }
  return Response.json({ error: "YouTube 공개 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
}

export function durationSeconds(value: string): number {
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
}

