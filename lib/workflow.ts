export type Platform = "YouTube" | "TikTok" | "Instagram" | "직접 입력";
export type CaptionStyle = "clean" | "emphasis" | "question";
export type ScriptType = "boldHook" | "demo" | "commentQA";
export type ReviewStatus = "pending" | "approved";

export const SCRIPT_TYPE_OPTIONS: Array<{ id: ScriptType; label: string; description: string }> = [
  { id: "boldHook", label: "강한 후킹형", description: "짧은 핵심 문장과 선명한 대비" },
  { id: "demo", label: "실용 시연형", description: "순서와 사용 조건을 차근히 설명" },
  { id: "commentQA", label: "댓글 질문형", description: "실제 관심 질문을 먼저 해결" }
];

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
  scriptType?: ScriptType;
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

export function buildDraft(source: SourceItem, scriptType: ScriptType = "boldHook"): Draft {
  const title = source.title.trim() || "소재 제목을 입력하세요";
  const notes = source.notes.trim();
  const score = scoreInterest(source);
  const leadingQuestion =
    score.intentComments[0] || source.comments.find((comment) => questionPattern.test(comment));
  const question = leadingQuestion || title;
  const scriptByType: Record<ScriptType, Script> = {
    boldHook: {
      hook: "한눈에 핵심: " + title,
      gi: notes || "먼저 시청자가 놓치기 쉬운 조건을 짧게 짚습니다.",
      seung: leadingQuestion
        ? "댓글에서 눈에 띄는 질문은 “" + leadingQuestion + "”입니다."
        : "이 소재에서 가장 먼저 확인할 기준을 보여줍니다.",
      jeon: "원본에서 확인되는 핵심 정보만 빠르게 보여주고, 중요한 단어를 자막으로 강조합니다.",
      gyeol: "결론은 한 문장으로 정리하고, 확인되지 않은 효과나 조건은 덧붙이지 않습니다.",
      cta: DEFAULT_CTA
    },
    demo: {
      hook: title + ", 사용 전에 이 순서부터 확인하세요.",
      gi: notes || "무엇을 준비해야 하는지와 사용 전에 확인할 조건을 소개합니다.",
      seung: "첫째, 필요한 조건을 확인합니다. 둘째, 실제 사용 장면을 보여줍니다.",
      jeon: "원본에 나온 순서와 사용 장면을 따라가며, 결과를 과장하지 않고 설명합니다.",
      gyeol: "같은 조건에서 따라 할 수 있도록 핵심 단계를 한 번 더 정리합니다.",
      cta: DEFAULT_CTA
    },
    commentQA: {
      hook: "“" + question + "” 이 질문부터 답해볼게요.",
      gi: notes || "질문이 나온 상황과 시청자가 먼저 알고 싶은 맥락을 짚습니다.",
      seung: "원본에서 확인할 수 있는 답을 차례대로 설명하고, 모르는 부분은 확인 필요로 표시합니다.",
      jeon: "조건이나 예외가 있으면 함께 말해 오해 없이 이해할 수 있게 합니다.",
      gyeol: "질문에 대한 답을 짧게 요약하고, 다음 행동을 분명하게 안내합니다.",
      cta: DEFAULT_CTA
    }
  };
  const script = scriptByType[scriptType];
  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    scriptType,
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

export function buildProductionPrompt(
  source: SourceItem,
  draft: Draft,
  captionStyle: CaptionStyle
): string {
  const selectedCaption = draft.captions.find((caption) => caption.style === captionStyle);
  const visualDirection: Record<ScriptType, string> = {
    boldHook: "시각 유형: 짙은 차콜 바탕에 라임 포인트를 쓰는 고대비 후킹형. 첫 문장은 크게, 한 화면 자막은 짧게 끊고 핵심 단어만 색으로 강조합니다.",
    demo: "시각 유형: 오프화이트와 차콜을 쓰는 정돈된 시연형. 단계 번호와 손동작/사용 장면을 맞추고, 자막은 하단 안전 여백 안에 둡니다.",
    commentQA: "시각 유형: 질문 카드로 시작하는 청록 포인트 Q&A형. 질문과 답을 색·위치로 분리하고, 한 번에 읽히는 짧은 자막으로 구성합니다."
  };
  const scriptType = draft.scriptType ?? "boldHook";
  const spokenScript = [
    draft.script.hook,
    draft.script.gi,
    draft.script.seung,
    draft.script.jeon,
    draft.script.gyeol,
    draft.script.cta
  ].filter(Boolean).join("\n");

  return [
    "한국어 세로 숏폼 영상 제작 브리프",
    "화면: 9:16 세로형, 약 30초, 모바일에서 읽기 쉬운 자막",
    "흐름: 0~2초 후킹 → 문제와 배경 → 시청자 질문 → 확인된 정보와 시연 → 한 문장 결론 → CTA",
    "연출: 핵심 제품이나 행동을 알아보기 쉽게 보여주는 실용 정보형. 확인되지 않은 기능·효과·가격은 만들지 말 것.",
    visualDirection[scriptType],
    "시각 요소는 새로 구성하고 참고 영상의 화면 배치·자막 문구·편집 순서를 그대로 복제하지 않습니다.",
    `소재: ${source.title}`,
    source.url ? `원본: ${source.url}` : "",
    `선택 자막: ${selectedCaption?.label ?? captionStyle}`,
    "대본:",
    spokenScript,
    "자막 줄:",
    ...(selectedCaption?.lines ?? [])
  ].filter(Boolean).join("\n");
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

