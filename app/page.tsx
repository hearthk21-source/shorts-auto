"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  buildDraft,
  makeCaptionVariants,
  sampleSources,
  scoreInterest,
  type CaptionStyle,
  type Draft,
  type Platform,
  type Script,
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
  const pendingCount = drafts.filter((draft) => draft.status === "pending").length;
  const averageScore = sources.length
    ? Math.round(sources.reduce((sum, source) => sum + scoreInterest(source).score, 0) / sources.length)
    : 0;

  function selectSource(source: SourceItem) {
    setSelectedSourceId(source.id);
    const latestDraft = drafts.find((draft) => draft.sourceId === source.id);
    setSelectedDraftId(latestDraft?.id ?? null);
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
    const draft = buildDraft(source);
    setDrafts((items) => [draft, ...items]);
    setSelectedSourceId(source.id);
    setSelectedDraftId(draft.id);
    setActiveCaption("clean");
    setNotice("대본 초안을 만들었습니다. 문장을 검수하고 승인 상태를 직접 설정해 주세요.");
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
    setNotice(nextStatus === "approved" ? "검수 승인 상태로 저장했습니다." : "승인을 취소하고 검수 대기로 되돌렸습니다.");
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
            반응이 있는 소재를 모으고, 댓글에서 관심 신호를 찾고,
            승인된 대본만 다음 단계로 넘깁니다.
          </p>
        </div>
        <div className="hero-status">
          <span className="status-dot" />
          <div>
            <strong>검수 모드</strong>
            <small>생성 · 게시 · DM 연결 전</small>
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
          <span className="metric-label">검수 대기</span>
          <strong>{pendingCount.toString().padStart(2, "0")}</strong>
          <span className="metric-note">사람의 승인 필요</span>
        </article>
        <article className="metric-card metric-card-accent">
          <span className="metric-label">외부 실행</span>
          <strong>잠금</strong>
          <span className="metric-note">OAuth 및 승인 후 연결</span>
        </article>
      </section>

      <nav className="workflow-bar" aria-label="자동화 단계">
        <div className="workflow-step active"><span>01</span><b>소재 수집</b></div>
        <div className="workflow-line" />
        <div className="workflow-step active"><span>02</span><b>댓글 점수화</b></div>
        <div className="workflow-line" />
        <div className="workflow-step active"><span>03</span><b>대본·자막</b></div>
        <div className="workflow-line" />
        <div className="workflow-step"><span>04</span><b>사람 검수</b></div>
        <div className="workflow-line" />
        <div className="workflow-step locked"><span>05</span><b>생성·배포</b><small>승인 게이트</small></div>
      </nav>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="알림 닫기">×</button></div>}

      <div className="workspace-grid">
        <aside className="left-column">
          <section className="panel intake-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 01 / COLLECT</p>
                <h2>소재 담기</h2>
              </div>
              <span className="step-tag">수동 입력</span>
            </div>
            <p className="muted intro-text">
              플랫폼 연동 전까지 링크, 공개 수치와 댓글을 입력해 소재를 모읍니다.
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
                    대본 초안 만들기 <span>→</span>
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
                  {selectedDraft.status === "approved" ? "검수 승인" : "검수 대기"}
                </span>
              )}
            </div>
            {!selectedDraft ? (
              <div className="empty-state">
                <span className="empty-symbol">✎</span>
                <p>소재를 선택하고 초안을 만들어 주세요.</p>
                <small>후킹부터 기승전결, CTA까지 편집할 수 있습니다.</small>
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
                    <strong>{selectedDraft.status === "approved" ? "검수 완료" : "대본 검수가 필요합니다"}</strong>
                    <small>
                      {selectedDraft.status === "approved"
                        ? "생성·게시 전에도 별도 확인과 승인이 필요합니다."
                        : "검수 승인 전에는 외부 실행 단계가 열리지 않습니다."}
                    </small>
                  </div>
                  <button className={"button " + (selectedDraft.status === "approved" ? "button-quiet" : "button-accent")} onClick={toggleApproval}>
                    {selectedDraft.status === "approved" ? "승인 취소" : "검수 승인"}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="execution-panel">
            <div className="execution-icon">⌑</div>
            <div className="execution-copy">
              <p className="eyebrow">STEP 04 / EXTERNAL ACTIONS</p>
              <h2>생성, DM, 게시에는 별도 승인</h2>
              <p>VerseIn은 OAuth 연결 후에도 영상 생성 때 코인을 사용합니다. 이 대시보드에서는 아직 외부 작업을 호출하지 않습니다.</p>
            </div>
            <div className="execution-locks">
              <span>VerseIn 생성 <b>연결 대기</b></span>
              <span>DM · 게시 <b>승인 게이트</b></span>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>저장 위치: 현재 브라우저</span>
            <span>입력한 댓글은 외부로 전송되지 않습니다.</span>
          </footer>
        </section>
      </div>
    </main>
  );
}

