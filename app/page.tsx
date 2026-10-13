"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import VideoVoiceoverStudio from "./VideoVoiceoverStudio";
import {
  buildDraft,
  buildProductionPrompt,
  makeCaptionVariants,
  SCRIPT_TYPE_OPTIONS,
  sampleSources,
  scoreInterest,
  type CaptionStyle,
  type Draft,
  type Platform,
  type Script,
  type ScriptType,
  type SourceItem
} from "../lib/workflow";

type SourceForm = {
  platform: Platform;
  title: string;
  url: string;
  notes: string;
  views: string;
  likes: string;
  comments: string;
};

type YouTubeCandidate = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  commentCount: number;
  duration: string;
  durationSeconds: number;
  url: string;
};

const emptyForm: SourceForm = {
  platform: "직접 입력",
  title: "",
  url: "",
  notes: "",
  views: "",
  likes: "",
  comments: ""
};

const scriptFields: Array<{ key: keyof Script; label: string; hint: string }> = [
  { key: "hook", label: "후킹", hint: "첫 1~2초에 시청자의 관심을 끄는 문장" },
  { key: "gi", label: "기", hint: "소재의 배경과 문제를 소개" },
  { key: "seung", label: "승", hint: "댓글의 관심 질문을 따라 전개" },
  { key: "jeon", label: "전", hint: "핵심 정보와 전환점을 제시" },
  { key: "gyeol", label: "결", hint: "검증된 핵심 내용을 마무리" },
  { key: "cta", label: "CTA", hint: "사용자가 지정한 댓글·팔로우 유도 문구" }
];

export default function Home() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [activeCaption, setActiveCaption] = useState<CaptionStyle>("clean");
  const [form, setForm] = useState<SourceForm>(emptyForm);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedSourceId, setUploadedSourceId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [youtubeQuery, setYoutubeQuery] = useState("");
  const [youtubeOrder, setYoutubeOrder] = useState<"viewCount" | "date">("viewCount");
  const [youtubeCandidates, setYoutubeCandidates] = useState<YouTubeCandidate[]>([]);
  const [youtubeNote, setYoutubeNote] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const savedSources = localStorage.getItem("shorts-studio.sources.v1");
      const savedDrafts = localStorage.getItem("shorts-studio.drafts.v1");
      if (savedSources) {
        const parsedSources = JSON.parse(savedSources) as SourceItem[];
        setSources(parsedSources);
        if (parsedSources[0]) setSelectedSourceId(parsedSources[0].id);
      }
      if (savedDrafts) setDrafts(JSON.parse(savedDrafts) as Draft[]);
    } catch {
      setNotice("저장된 브라우저 데이터 일부를 읽지 못했습니다. 새 소재를 입력해 계속할 수 있습니다.");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("shorts-studio.sources.v1", JSON.stringify(sources));
    localStorage.setItem("shorts-studio.drafts.v1", JSON.stringify(drafts));
  }, [ready, sources, drafts]);

  const selectedSource = sources.find((source) => source.id === selectedSourceId);
  const selectedDraft = drafts.find(
    (draft) => draft.id === selectedDraftId && draft.sourceId === selectedSourceId
  );
  const selectedScore = selectedSource ? scoreInterest(selectedSource) : null;
  const sortedSources = [...sources].sort(
    (a, b) => scoreInterest(b).score - scoreInterest(a).score
  );
  const draftedSourceCount = new Set(drafts.map((draft) => draft.sourceId)).size;
  const averageScore = sources.length
    ? Math.round(sources.reduce((sum, source) => sum + scoreInterest(source).score, 0) / sources.length)
    : 0;

  async function collectYouTube(mode: "trending" | "search") {
    if (mode === "search" && youtubeQuery.trim().length < 2) {
      setNotice("YouTube 키워드를 2자 이상 입력해 주세요.");
      return;
    }
    setYoutubeLoading(true);
    setYoutubeNote("");
    try {
      const query = new URLSearchParams({ mode, maxResults: "24" });
      if (mode === "search") {
        query.set("q", youtubeQuery.trim());
        query.set("order", youtubeOrder);
      }
      const response = await fetch(`/api/youtube/sources?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "YouTube 데이터를 불러오지 못했습니다.");
      setYoutubeCandidates(data.items ?? []);
      setYoutubeNote(data.note ?? "");
      setNotice(data.items?.length ? `YouTube 후보 ${data.items.length}개를 불러왔습니다.` : "조건에 맞는 영상 후보가 없습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "YouTube 데이터를 불러오지 못했습니다.");
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function addYouTubeCandidate(candidate: YouTubeCandidate) {
    const existing = sources.find((source) => source.url === candidate.url);
    if (existing) {
      selectSource(existing);
      setNotice("이미 소재 목록에 있는 영상입니다.");
      return;
    }

    setAddingVideoId(candidate.videoId);
    let comments: string[] = [];
    let commentNote = "";
    try {
      const response = await fetch(`/api/youtube/comments?videoId=${encodeURIComponent(candidate.videoId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "댓글 수집에 실패했습니다.");
      comments = data.comments ?? [];
      commentNote = data.note ?? "";
    } catch (error) {
      commentNote = error instanceof Error ? error.message : "댓글을 불러오지 못했습니다.";
    }

    const source: SourceItem = {
      id: crypto.randomUUID(),
      platform: "YouTube",
      title: candidate.title,
      url: candidate.url,
      notes: [candidate.description, `영상 길이: ${candidate.duration || "확인 불가"}`, commentNote].filter(Boolean).join("\n\n"),
      views: candidate.views,
      likes: candidate.likes,
      comments,
      createdAt: new Date().toISOString()
    };
    setSources((items) => [source, ...items]);
    setSelectedSourceId(source.id);
    setSelectedDraftId(null);
    setNotice(`소재로 저장했습니다. 공개 댓글 ${comments.length}개를 함께 가져왔습니다.`);
    setAddingVideoId(null);
  }

  function downloadProductionPack() {
    if (!selectedSource || !selectedDraft) return;
    const prompt = buildProductionPrompt(selectedSource, selectedDraft, activeCaption);
    const caption = selectedDraft.captions.find((item) => item.style === activeCaption);
    const bundle = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: {
        platform: selectedSource.platform,
        title: selectedSource.title,
        url: selectedSource.url,
        views: selectedSource.views,
        likes: selectedSource.likes
      },
      script: selectedDraft.script,
      scriptType: selectedDraft.scriptType ?? "boldHook",
      selectedCaption: caption,
      productionPrompt: prompt,
      approvalGates: {
        paidVideoGeneration: "requires user approval",
        socialAccountPublishing: "requires user approval"
      }
    };
    const file = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shorts-production-pack.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("제작 패키지를 저장했습니다. 이 작업은 영상 생성이나 비용을 발생시키지 않습니다.");
  }

  function selectSource(source: SourceItem) {
    setSelectedSourceId(source.id);
    setSelectedDraftId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setNotice("소재 제목을 입력해 주세요.");
      return;
    }
    const source: SourceItem = {
      id: crypto.randomUUID(),
      platform: form.platform,
      title: form.title.trim(),
      url: form.url.trim(),
      notes: form.notes.trim(),
      views: Math.max(0, Number(form.views) || 0),
      likes: Math.max(0, Number(form.likes) || 0),
      comments: form.comments.split(/\r?\n/).map((comment) => comment.trim()).filter(Boolean),
      createdAt: new Date().toISOString()
    };
    setSources((items) => [source, ...items]);
    setSelectedSourceId(source.id);
    setSelectedDraftId(null);
    setForm(emptyForm);
    setNotice("소재를 저장했습니다. 댓글 기반 관심도 점수를 확인할 수 있습니다.");
  }

  function createScript(source: SourceItem) {
    const variants = SCRIPT_TYPE_OPTIONS.map((option) => buildDraft(source, option.id));
    setDrafts((items) => [...variants, ...items]);
    setSelectedSourceId(source.id);
    setSelectedDraftId(null);
    setActiveCaption("clean");
    setNotice("대본 3종을 만들었습니다. 영상 생성 전에 사용할 유형을 선택해 주세요.");
  }

  function handleVideoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setNotice("동영상 파일을 선택해 주세요.");
      event.target.value = "";
      return;
    }
    setUploadedFile(file);
    setUploadedSourceId(null);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    setUploadTitle(baseName);
    setSelectedDraftId(null);
    setNotice("영상 파일을 이 브라우저에 불러왔습니다. 원본은 서버로 업로드되지 않습니다.");
  }

  function createDraftsFromUploadedVideo() {
    if (!uploadedFile) {
      setNotice("먼저 동영상 파일을 선택해 주세요.");
      return;
    }
    const title = uploadTitle.trim() || uploadedFile.name.replace(/\.[^.]+$/, "");
    const source: SourceItem = {
      id: crypto.randomUUID(),
      platform: "직접 입력",
      title,
      url: "",
      notes: [uploadNotes.trim(), `업로드 파일: ${uploadedFile.name}`].filter(Boolean).join("\n\n"),
      views: 0,
      likes: 0,
      comments: [],
      createdAt: new Date().toISOString()
    };
    const variants = SCRIPT_TYPE_OPTIONS.map((option) => buildDraft(source, option.id));
    setSources((items) => [source, ...items]);
    setDrafts((items) => [...variants, ...items]);
    setUploadedSourceId(source.id);
    setSelectedSourceId(source.id);
    setSelectedDraftId(null);
    setActiveCaption("clean");
    setNotice("영상 소재에 맞춘 대본 3종을 준비했습니다. 사용할 유형을 선택해 주세요.");
  }

  function chooseScriptType(scriptType: ScriptType) {
    if (!selectedSource) return;
    const existing = drafts.find((draft) => draft.sourceId === selectedSource.id && draft.scriptType === scriptType);
    if (existing) {
      setSelectedDraftId(existing.id);
      return;
    }
    const variants = drafts.some((draft) => draft.sourceId === selectedSource.id)
      ? [buildDraft(selectedSource, scriptType)]
      : SCRIPT_TYPE_OPTIONS.map((option) => buildDraft(selectedSource, option.id));
    const chosen = variants.find((draft) => draft.scriptType === scriptType);
    setDrafts((items) => [...variants, ...items]);
    setSelectedDraftId(chosen?.id ?? null);
    setActiveCaption("clean");
  }

  function updateScript(field: keyof Script, value: string) {
    if (!selectedDraft) return;
    setDrafts((items) =>
      items.map((draft) => {
        if (draft.id !== selectedDraft.id) return draft;
        const script = { ...draft.script, [field]: value };
        return {
          ...draft,
          script,
          captions: makeCaptionVariants(script),
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  function toggleApproval() {
    if (!selectedDraft) return;
    const nextStatus = selectedDraft.status === "approved" ? "pending" : "approved";
    setDrafts((items) =>
      items.map((draft) =>
        draft.id === selectedDraft.id
          ? { ...draft, status: nextStatus, updatedAt: new Date().toISOString() }
          : draft
      )
    );
    setNotice(nextStatus === "approved" ? "선택 검수 완료로 표시했습니다." : "선택 검수 표시를 해제했습니다.");
  }

  function loadSamples() {
    const examples = sampleSources();
    setSources((items) => [...examples, ...items]);
    setSelectedSourceId(examples[0].id);
    setSelectedDraftId(null);
    setNotice("샘플 소재 2개를 추가했습니다. 실제 계정 데이터가 아닌 예시입니다.");
  }

  const scoreParts = selectedScore
    ? [
        { label: "도달", value: selectedScore.reach, weight: "15%" },
        { label: "반응률", value: selectedScore.engagement, weight: "20%" },
        { label: "댓글량", value: selectedScore.commentVolume, weight: "20%" },
        { label: "제품 의도", value: selectedScore.productIntent, weight: "30%" },
        { label: "질문 수요", value: selectedScore.questionDemand, weight: "15%" }
      ]
    : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Shorts Studio 홈">
          <span className="brand-mark">S</span>
          <span>SHORTS STUDIO</span>
        </a>
        <div className="topbar-right">
          <span className="local-pill"><i /> 브라우저 저장</span>
          <span className="avatar">SS</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">SHORT FORM WORKFLOW / 01</p>
          <h1>소재에서 검수까지,<br /><em>한 흐름으로.</em></h1>
          <p className="hero-copy">
            내 영상 파일이나 공개 소재에서 대본 세 가지를 만들고, 선택한 대본에 음성과 자막을 입힙니다.
            비용이 드는 생성과 계정 게시 직전에만 승인을 받습니다.
          </p>
        </div>
        <div className="hero-status">
          <span className="status-dot" />
          <div>
            <strong>자동 준비 모드</strong>
            <small>유료 생성 · 계정 게시 전 승인</small>
          </div>
          <span className="lock-icon">⌑</span>
        </div>
      </section>

      <section className="metrics-grid" aria-label="작업 현황">
        <article className="metric-card">
          <span className="metric-label">수집 소재</span>
          <strong>{sources.length.toString().padStart(2, "0")}</strong>
          <span className="metric-note">이 브라우저에서 저장</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">평균 관심도</span>
          <strong>{averageScore}<small>/100</small></strong>
          <span className="metric-note">댓글·반응 입력 기준</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">대본 준비 소재</span>
          <strong>{draftedSourceCount.toString().padStart(2, "0")}</strong>
          <span className="metric-note">소재별 대본 3종</span>
        </article>
        <article className="metric-card metric-card-accent">
          <span className="metric-label">승인 게이트</span>
          <strong>2단계</strong>
          <span className="metric-note">유료 생성 · 계정 게시</span>
        </article>
      </section>

      <nav className="workflow-bar" aria-label="자동화 단계">
        <div className="workflow-step active"><span>01</span><b>영상·소재</b></div>
        <div className="workflow-line" />
        <div className="workflow-step active"><span>02</span><b>댓글 점수화</b></div>
        <div className="workflow-line" />
        <div className="workflow-step active"><span>03</span><b>대본 3종 선택</b></div>
        <div className="workflow-line" />
        <div className="workflow-step"><span>04</span><b>TTS·자막 합성</b></div>
        <div className="workflow-line" />
        <div className="workflow-step locked"><span>05</span><b>생성·게시</b><small>비용·계정 승인</small></div>
      </nav>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="알림 닫기">×</button></div>}

      <div className="workspace-grid">
        <aside className="left-column">
          <section className="panel video-upload-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 01 / UPLOAD YOUR VIDEO</p>
                <h2>내 영상 파일로 시작</h2>
              </div>
              <span className="step-tag">파일은 기기에만</span>
            </div>
            <p className="muted intro-text">
              MP4·MOV·WebM 영상을 선택하세요. 장면·음성을 자동 분석하지는 않으므로, 대본의 정확도를 위해 영상 내용이나 기존 대사를 적어 주세요.
            </p>
            <div className="source-form">
              <label>
                영상 파일
                <input type="file" accept="video/*" onChange={handleVideoFile} />
              </label>
              {uploadedFile && (
                <>
                  <div className="upload-file-card">
                    <strong>{uploadedFile.name}</strong>
                    <small>{(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB · 업로드 후 이 브라우저 탭에서 사용</small>
                  </div>
                  <label>
                    영상 제목
                    <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="영상의 핵심 주제" />
                  </label>
                  <label>
                    장면 설명·대사·원하는 메시지 <span className="field-note">대본 참고용</span>
                    <textarea value={uploadNotes} onChange={(event) => setUploadNotes(event.target.value)} placeholder="영상에서 보여주는 내용, 이미 녹음된 대사, 꼭 지킬 사실이나 CTA를 적어 주세요." rows={4} />
                  </label>
                  <button className="button button-dark full-width" type="button" onClick={createDraftsFromUploadedVideo}>
                    업로드 영상으로 대본 3종 만들기 <span>→</span>
                  </button>
                </>
              )}
              {!uploadedFile && <div className="upload-empty">영상 파일을 선택하면 제목과 설명을 적는 칸이 열립니다.</div>}
            </div>
          </section>

          <section className="panel youtube-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 01 / YOUTUBE PUBLIC DATA</p>
                <h2>YouTube 소재 자동 수집</h2>
              </div>
              <span className="step-tag">무료 API 할당량</span>
            </div>
            <p className="muted intro-text">
              한국 인기 영상 또는 키워드에서 3분 이내 후보를 찾습니다. API는 세로 비율을 알려주지 않으므로 Shorts 여부는 원본을 확인해 주세요.
            </p>
            <form className="youtube-search" onSubmit={(event) => { event.preventDefault(); void collectYouTube("search"); }}>
              <label>
                키워드 검색 <span className="field-note">선택 입력</span>
                <input value={youtubeQuery} onChange={(event) => setYoutubeQuery(event.target.value)} placeholder="예: 좁은 방 수납 아이디어" />
              </label>
              <div className="youtube-search-controls">
                <select aria-label="검색 정렬" value={youtubeOrder} onChange={(event) => setYoutubeOrder(event.target.value as "viewCount" | "date")}>
                  <option value="viewCount">조회수 높은 순</option>
                  <option value="date">최신 순</option>
                </select>
                <button className="button button-dark" type="submit" disabled={youtubeLoading}>
                  {youtubeLoading ? "검색 중…" : "키워드 검색"}
                </button>
              </div>
              <button className="button button-outline full-width" type="button" disabled={youtubeLoading} onClick={() => void collectYouTube("trending")}>
                {youtubeLoading ? "불러오는 중…" : "한국 인기 후보 불러오기"}
              </button>
            </form>
            {youtubeNote && <p className="youtube-note">{youtubeNote}</p>}
            {youtubeCandidates.length > 0 && (
              <div className="youtube-candidate-list">
                {youtubeCandidates.map((candidate) => (
                  <article className="youtube-candidate" key={candidate.videoId}>
                    <div className="youtube-candidate-title">
                      <strong>{candidate.title}</strong>
                      <small>{candidate.channelTitle} · {candidate.duration || "길이 미상"}</small>
                    </div>
                    <div className="youtube-candidate-stats">
                      <span>조회 {candidate.views.toLocaleString()}</span>
                      <span>댓글 {candidate.commentCount.toLocaleString()}</span>
                    </div>
                    <div className="youtube-candidate-actions">
                      <a href={candidate.url} target="_blank" rel="noreferrer">원본 보기 ↗</a>
                      <button className="button button-quiet" type="button" disabled={addingVideoId === candidate.videoId} onClick={() => void addYouTubeCandidate(candidate)}>
                        {addingVideoId === candidate.videoId ? "저장 중…" : "댓글과 소재 저장"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel intake-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 01 / COLLECT</p>
                <h2>소재 담기</h2>
              </div>
              <span className="step-tag">다른 플랫폼 직접 입력</span>
            </div>
            <p className="muted intro-text">
              TikTok·Instagram이나 API 검색에 나오지 않은 소재는 링크와 댓글을 직접 추가할 수 있습니다.
            </p>
            <form onSubmit={handleSubmit} className="source-form">
              <label>
                출처 플랫폼
                <select
                  value={form.platform}
                  onChange={(event) => setForm((value) => ({ ...value, platform: event.target.value as Platform }))}
                >
                  <option>YouTube</option>
                  <option>TikTok</option>
                  <option>Instagram</option>
                  <option>직접 입력</option>
                </select>
              </label>
              <label>
                소재 제목 <span className="required">*</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                  placeholder="예: 설치가 쉬운 수납 아이디어"
                  required
                />
              </label>
              <label>
                원본 링크
                <input
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm((value) => ({ ...value, url: event.target.value }))}
                  placeholder="https://"
                />
              </label>
              <div className="two-fields">
                <label>
                  조회수
                  <input type="number" min="0" value={form.views} onChange={(event) => setForm((value) => ({ ...value, views: event.target.value }))} placeholder="0" />
                </label>
                <label>
                  좋아요
                  <input type="number" min="0" value={form.likes} onChange={(event) => setForm((value) => ({ ...value, likes: event.target.value }))} placeholder="0" />
                </label>
              </div>
              <label>
                소재 메모
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
                  placeholder="영상의 핵심 정보, 확인한 사실, 주의할 조건을 입력하세요."
                  rows={3}
                />
              </label>
              <label>
                댓글 붙여넣기 <span className="field-note">한 줄에 댓글 하나</span>
                <textarea
                  value={form.comments}
                  onChange={(event) => setForm((value) => ({ ...value, comments: event.target.value }))}
                  placeholder={"제품 정보 알려주세요\n설치가 어렵지 않나요?"}
                  rows={4}
                />
              </label>
              <button className="button button-dark full-width" type="submit">
                <span>＋</span> 소재 저장 및 점수 계산
              </button>
              <button className="button button-quiet full-width sample-button" type="button" onClick={loadSamples}>
                예시 데이터 불러오기
              </button>
            </form>
          </section>

          <section className="panel queue-panel">
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">SOURCE QUEUE</p>
                <h2>소재 목록 <span className="count-chip">{sources.length}</span></h2>
              </div>
              <span className="sort-caption">관심도순</span>
            </div>
            {sortedSources.length === 0 ? (
              <div className="empty-state small-empty">
                <span className="empty-symbol">↘</span>
                <p>아직 저장된 소재가 없습니다.</p>
                <small>왼쪽에서 링크와 댓글을 추가하세요.</small>
              </div>
            ) : (
              <div className="source-list">
                {sortedSources.map((source) => {
                  const score = scoreInterest(source).score;
                  return (
                    <button
                      className={"source-item " + (source.id === selectedSourceId ? "selected" : "")}
                      key={source.id}
                      onClick={() => selectSource(source)}
                    >
                      <span className="source-platform">{source.platform}</span>
                      <span className="source-title">{source.title}</span>
                      <span className="source-meta">
                        <span>댓글 {source.comments.length}</span>
                        <span className="source-score">{score}<small>점</small></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        <section className="right-column">
          <section className="panel score-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 02 / COMMENT SIGNALS</p>
                <h2>관심도 분석</h2>
              </div>
              {selectedScore && <div className="score-badge"><strong>{selectedScore.score}</strong><span>/ 100</span></div>}
            </div>
            {!selectedSource || !selectedScore ? (
              <div className="empty-state">
                <span className="empty-symbol">◎</span>
                <p>소재를 선택하면 분석이 시작됩니다.</p>
                <small>댓글 의도와 공개 반응 수치를 함께 보여줍니다.</small>
              </div>
            ) : (
              <>
                <div className="selected-source-row">
                  <div>
                    <span className="source-platform">{selectedSource.platform}</span>
                    <h3>{selectedSource.title}</h3>
                  </div>
                  {selectedSource.url && <a href={selectedSource.url} target="_blank" rel="noreferrer">원본 보기 ↗</a>}
                </div>
                <div className="score-bars">
                  {scoreParts.map((part) => (
                    <div className="score-row" key={part.label}>
                      <span className="score-label">{part.label}<small>{part.weight}</small></span>
                      <div className="bar-track"><span style={{ width: part.value + "%" }} /></div>
                      <strong>{part.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="score-footnote">
                  <span>산식: 도달 15 · 반응률 20 · 댓글량 20 · 제품 의도 30 · 질문 수요 15</span>
                  <span>플랫폼 간 단순 비교 지표</span>
                </div>
                <div className="signal-row">
                  <div className="signal-box">
                    <span className="signal-label">제품 의도 댓글</span>
                    <strong>{selectedScore.intentComments.length}</strong>
                    <small>가격 · 구매 · 설치 · 정보 관련</small>
                  </div>
                  <div className="signal-box">
                    <span className="signal-label">수집한 댓글</span>
                    <strong>{selectedSource.comments.length}</strong>
                    <small>질문·반복 관심 신호를 계산</small>
                  </div>
                  <button className="button button-outline generate-script" onClick={() => createScript(selectedSource)}>
                    대본 3종 만들기 <span>→</span>
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="panel script-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 03 / SCRIPT & CAPTIONS</p>
                <h2>대본과 자막</h2>
              </div>
              {selectedDraft && (
                <span className={"review-chip " + (selectedDraft.status === "approved" ? "approved" : "")}>
                  {selectedDraft.status === "approved" ? "선택 검수 완료" : "선택 검수 전"}
                </span>
              )}
            </div>
            {selectedSource && (
              <div className="script-type-picker">
                <strong>실행 전에 사용할 대본 유형을 선택해 주세요.</strong>
                <small>세 가지 모두 준비되며, 선택한 유형만 제작 패키지에 담깁니다.</small>
                <div className="script-type-options">
                  {SCRIPT_TYPE_OPTIONS.map((option) => {
                    const isSelected = selectedDraft?.scriptType === option.id;
                    return (
                      <button
                        className={"script-type-option " + (isSelected ? "selected" : "")}
                        type="button"
                        key={option.id}
                        aria-pressed={isSelected}
                        onClick={() => chooseScriptType(option.id)}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!selectedDraft ? (
              <div className="empty-state">
                <span className="empty-symbol">✎</span>
                <p>{selectedSource ? "세 가지 대본 중 하나를 선택해 주세요." : "소재를 선택하고 대본을 준비해 주세요."}</p>
                <small>무료 준비 단계이며 영상 생성이나 게시를 실행하지 않습니다.</small>
              </div>
            ) : (
              <>
                <div className="script-fields">
                  {scriptFields.map((field) => (
                    <label className={"script-field " + (field.key === "cta" ? "cta-field" : "")} key={field.key}>
                      <span><b>{field.label}</b><small>{field.hint}</small></span>
                      <textarea
                        value={selectedDraft.script[field.key]}
                        onChange={(event) => updateScript(field.key, event.target.value)}
                        rows={field.key === "hook" || field.key === "cta" ? 2 : 3}
                      />
                    </label>
                  ))}
                </div>
                <div className="caption-section">
                  <div className="caption-heading">
                    <div>
                      <p className="eyebrow">THREE CAPTION STYLES</p>
                      <h3>자막 유형 선택</h3>
                    </div>
                    <span>CTA 포함</span>
                  </div>
                  <div className="caption-tabs" role="tablist" aria-label="자막 유형">
                    {selectedDraft.captions.map((caption) => (
                      <button
                        key={caption.style}
                        role="tab"
                        aria-selected={activeCaption === caption.style}
                        className={"caption-tab " + (activeCaption === caption.style ? "active" : "")}
                        onClick={() => setActiveCaption(caption.style)}
                      >
                        <strong>{caption.label}</strong>
                        <small>{caption.description}</small>
                      </button>
                    ))}
                  </div>
                  <div className="caption-preview">
                    <span className="preview-label">자막 미리보기</span>
                    {selectedDraft.captions.find((caption) => caption.style === activeCaption)?.lines.map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                </div>
                <div className="approval-row">
                  <div>
                    <strong>{selectedDraft.status === "approved" ? "선택 검수 표시 완료" : "선택 검수 표시"}</strong>
                    <small>
                      {selectedDraft.status === "approved"
                        ? "무료 준비는 이어집니다. 영상 생성 비용과 계정 게시 직전에 별도 승인을 받습니다."
                        : "검수 표시는 선택 사항입니다. 영상 생성 비용과 계정 게시 직전에만 진행을 멈춥니다."}
                    </small>
                  </div>
                  <button className={"button " + (selectedDraft.status === "approved" ? "button-quiet" : "button-accent")} onClick={toggleApproval}>
                    {selectedDraft.status === "approved" ? "검수 표시 해제" : "검수 확인 표시"}
                  </button>
                </div>
                <div className="production-pack">
                  <div>
                    <p className="eyebrow">STEP 04 / FREE PREPARATION</p>
                    <h3>영상 제작 패키지</h3>
                    <p>대본, 선택한 자막, 세로형 제작 프롬프트를 파일로 준비합니다. 영상 생성은 실행하지 않습니다.</p>
                  </div>
                  <pre>{buildProductionPrompt(selectedSource!, selectedDraft, activeCaption)}</pre>
                  <button className="button button-outline" type="button" onClick={downloadProductionPack}>무료 제작 패키지 저장</button>
                </div>
              </>
            )}
          </section>

          <VideoVoiceoverStudio
            file={selectedSourceId === uploadedSourceId ? uploadedFile : null}
            title={selectedSource?.title ?? "shorts"}
            script={selectedDraft?.script ?? null}
            captionLines={selectedDraft?.captions.find((caption) => caption.style === activeCaption)?.lines ?? []}
            captionStyle={activeCaption}
            onNotice={setNotice}
          />

          <section className="execution-panel">
            <div className="execution-icon">⌑</div>
            <div className="execution-copy">
              <p className="eyebrow">STEP 05 / APPROVAL GATES</p>
              <h2>유료 생성 전과 계정 게시 전에 승인</h2>
              <p>무료 브라우저 TTS 녹화 파일은 직접 저장할 수 있습니다. 유료 생성은 비용 승인을 받은 뒤에, 소셜 계정 게시도 대상 계정과 최종 영상을 확인받은 뒤에 진행합니다.</p>
            </div>
            <div className="execution-locks">
              <span>VerseIn 영상 생성 <b>비용 승인</b></span>
              <span>YouTube 계정 게시 <b>게시 승인</b></span>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>소재와 대본 저장: 현재 브라우저</span>
            <span>업로드 영상은 이 브라우저 안에서 처리하며, 소셜 게시 전 별도 승인이 필요합니다.</span>
          </footer>
        </section>
      </div>
    </main>
  );
}

