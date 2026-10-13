export type Platform = "YouTube" | "TikTok" | "Instagram" | "직접 입력";
export type CaptionStyle = "clean" | "emphasis" | "question";
export type ReviewStatus = "pending" | "approved";

export type SourceItem = {
  id: string;
  platform: Platform;
  title: string;
  url: string;
  notes: string;
  views: number;
  likes: number;
  comments: string[];
  createdAt: string;
};

export type Script = {
  hook: string;
  gi: string;
  seung: string;
  jeon: string;
  gyeol: string;
  cta: string;
};

export type CaptionVariant = {
  style: CaptionStyle;
  label: string;
  description: string;
  lines: string[];
};

export type Draft = {
  id: string;
  sourceId: string;
  script: Script;
  captions: CaptionVariant[];
  status: ReviewStatus;
  updatedAt: string;
};

export type ScoreBreakdown = {
  score: number;
  reach: number;
  engagement: number;
  commentVolume: number;
  productIntent: number;
  questionDemand: number;
  intentComments: string[];
};

export const DEFAULT_CTA = "제품정보나 설치원하면 댓글남기고 팔로우해주세요";

const productIntentPattern = /제품|가격|구매|구입|설치|링크|정보|주문|문의|어디서|구할 수|살 수/;
const questionPattern = /\?|궁금|어떻게|무엇|뭐가|왜|언제|어디|가능|되나요|인가요|맞나요/;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreInterest(source: SourceItem): ScoreBreakdown {
  const comments = source.comments.map((comment) => comment.trim()).filter(Boolean);
  const intentComments = comments.filter((comment) => productIntentPattern.test(comment));
  const questionComments = comments.filter((comment) => questionPattern.test(comment));
  const reach = source.views > 0 ? clamp((Math.log10(source.views + 1) / 6) * 100) : 0;
  const engagementRate =
    source.views > 0 ? ((source.likes + comments.length) / source.views) * 100 : 0;
  const engagement = clamp((engagementRate / 8) * 100);
  const commentVolume = clamp(comments.length * 5);
  const productIntent = comments.length ? clamp((intentComments.length / comments.length) * 100) : 0;
  const questionDemand = comments.length ? clamp((questionComments.length / comments.length) * 100) : 0;
  const score = clamp(
    reach * 0.15 +
      engagement * 0.2 +
      commentVolume * 0.2 +
      productIntent * 0.3 +
      questionDemand * 0.15
  );
  return { score, reach, engagement, commentVolume, productIntent, questionDemand, intentComments };
}

export function buildDraft(source: SourceItem): Draft {
  const title = source.title.trim() || "소재 제목을 입력하세요";
  const notes = source.notes.trim();
  const score = scoreInterest(source);
  const leadingQuestion =
    score.intentComments[0] || source.comments.find((comment) => questionPattern.test(comment));
  const script: Script = {
    hook: title + "의 핵심을 짧게 정리해볼게요.",
    gi: notes || "먼저 원본 소재의 배경과 시청자가 궁금해하는 지점을 설명합니다.",
    seung: leadingQuestion
      ? "댓글에서 나온 질문: “" + leadingQuestion + "” 이 궁금증을 중심으로 내용을 이어갑니다."
      : "관심도 점수 " + score.score + "점을 바탕으로 시청자가 확인할 질문을 구체화합니다.",
    jeon: "원문에서 확인되는 정보와 실제 사용 조건을 보여주고, 확인되지 않은 주장은 덧붙이지 않습니다.",
    gyeol: "핵심 내용을 한 문장으로 정리하고, 출처에서 확인한 정보만 최종 답변에 남깁니다.",
    cta: DEFAULT_CTA
  };
  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    script,
    captions: makeCaptionVariants(script),
    status: "pending",
    updatedAt: new Date().toISOString()
  };
}

export function makeCaptionVariants(script: Script): CaptionVariant[] {
  const content = [script.hook, script.gi, script.seung, script.jeon, script.gyeol].filter(Boolean);
  const cta = script.cta.trim();
  const withCta = (lines: string[]) => (cta ? [...lines, cta] : lines);
  return [
    {
      style: "clean",
      label: "기본형",
      description: "짧고 읽기 쉽게 정리",
      lines: withCta(content)
    },
    {
      style: "emphasis",
      label: "강조형",
      description: "핵심 문장 앞에 시각적 포인트",
      lines: withCta(content.map((line, index) => (index === 0 ? "핵심 | " + line : "• " + line)))
    },
    {
      style: "question",
      label: "질문형",
      description: "시청자 궁금증을 따라 전개",
      lines: withCta(content.map((line, index) => (index === 0 ? "궁금한 점부터 볼까요? " + line : "확인할 내용 | " + line)))
    }
  ];
}

export function sampleSources(): SourceItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      platform: "YouTube",
      title: "좁은 공간을 정리하는 접이식 수납 아이디어",
      url: "",
      notes: "접이식 수납 제품의 크기와 설치 조건을 소개하는 영상 소재입니다.",
      views: 28400,
      likes: 1920,
      comments: [
        "제품 정보 알려주세요",
        "설치가 어렵지 않나요?",
        "이거 어디서 살 수 있어요?",
        "좁은 방에도 사용할 수 있을까요?"
      ],
      createdAt: now
    },
    {
      id: crypto.randomUUID(),
      platform: "직접 입력",
      title: "초보자를 위한 화분 물주기 체크",
      url: "",
      notes: "식물 종류와 계절에 따라 달라질 수 있으므로 조건을 함께 확인해야 합니다.",
      views: 7400,
      likes: 310,
      comments: ["물을 며칠마다 줘야 하나요?", "빛이 적은 방에서도 괜찮나요?"],
      createdAt: now
    }
  ];
}

