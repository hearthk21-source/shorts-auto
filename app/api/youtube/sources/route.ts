import { durationSeconds, youtubeErrorResponse, youtubeGet } from "../../../../lib/youtube-api";

export const dynamic = "force-dynamic";

type Video = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

type VideoResponse = { items?: Video[] };
type SearchResponse = { items?: Array<{ id?: { videoId?: string }; snippet?: Video["snippet"] }> };

function toCandidate(video: Video) {
  const duration = video.contentDetails?.duration ?? "";
  return {
    videoId: video.id,
    title: video.snippet?.title ?? "제목 없음",
    description: (video.snippet?.description ?? "").slice(0, 900),
    channelTitle: video.snippet?.channelTitle ?? "채널 정보 없음",
    publishedAt: video.snippet?.publishedAt ?? "",
    thumbnailUrl: video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url ?? "",
    views: Number(video.statistics?.viewCount ?? 0),
    likes: Number(video.statistics?.likeCount ?? 0),
    commentCount: Number(video.statistics?.commentCount ?? 0),
    duration,
    durationSeconds: durationSeconds(duration),
    url: `https://www.youtube.com/watch?v=${video.id}`
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "trending";
  const requestedCount = Number(params.get("maxResults") ?? 24);
  const maxResults = Math.max(1, Math.min(50, Number.isFinite(requestedCount) ? requestedCount : 24));

  try {
    let videos: Video[];
    if (mode === "trending") {
      const response = await youtubeGet<VideoResponse>("videos", {
        part: "snippet,statistics,contentDetails",
        chart: "mostPopular",
        regionCode: "KR",
        hl: "ko",
        maxResults: "50"
      });
      videos = response.items ?? [];
    } else if (mode === "search") {
      const query = (params.get("q") ?? "").trim();
      if (query.length < 2 || query.length > 100) {
        return Response.json({ error: "검색어는 2~100자로 입력해 주세요." }, { status: 400 });
      }
      const requestedOrder = params.get("order");
      const order = requestedOrder === "date" ? "date" : "viewCount";
      const search = await youtubeGet<SearchResponse>("search", {
        part: "snippet",
        q: query,
        type: "video",
        videoDuration: "short",
        order,
        regionCode: "KR",
        relevanceLanguage: "ko",
        maxResults: String(maxResults)
      });
      const found = search.items ?? [];
      const ids = found.map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
      if (ids.length === 0) return Response.json({ items: [], note: "검색 결과가 없습니다." });

      const details = await youtubeGet<VideoResponse>("videos", {
        part: "snippet,statistics,contentDetails",
        id: ids.join(",")
      });
      const detailsById = new Map((details.items ?? []).map((video) => [video.id, video]));
      videos = ids.map((id) => detailsById.get(id)).filter((video): video is Video => Boolean(video));
    } else {
      return Response.json({ error: "지원하지 않는 수집 방식입니다." }, { status: 400 });
    }

    const items = videos
      .map(toCandidate)
      .filter((video) => video.durationSeconds <= 180)
      .slice(0, maxResults);

    return Response.json({
      items,
      note: "길이 3분 이내 후보입니다. 공개 API는 세로 비율 여부를 제공하지 않아 Shorts 여부는 원본에서 확인해야 합니다."
    });
  } catch (error) {
    return youtubeErrorResponse(error);
  }
}

