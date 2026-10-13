import { youtubeErrorResponse, youtubeGet, YouTubeApiError } from "../../../../lib/youtube-api";

export const dynamic = "force-dynamic";

type CommentThread = {
  snippet?: {
    topLevelComment?: {
      snippet?: { textDisplay?: string; likeCount?: number };
    };
  };
};

type CommentResponse = { items?: CommentThread[] };

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: "올바른 YouTube 영상 ID가 아닙니다." }, { status: 400 });
  }

  try {
    const response = await youtubeGet<CommentResponse>("commentThreads", {
      part: "snippet",
      videoId,
      maxResults: "50",
      order: "relevance",
      textFormat: "plainText"
    });
    const comments = (response.items ?? [])
      .map((thread) => thread.snippet?.topLevelComment?.snippet?.textDisplay?.trim() ?? "")
      .filter(Boolean);
    return Response.json({ comments, note: "공개 상위 댓글을 관련도순으로 가져왔습니다." });
  } catch (error) {
    if (error instanceof YouTubeApiError && error.reason === "commentsDisabled") {
      return Response.json({ comments: [], note: "이 영상은 댓글이 비활성화되어 있습니다." });
    }
    return youtubeErrorResponse(error);
  }
}

