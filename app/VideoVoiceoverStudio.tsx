"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptionStyle, Script } from "../lib/workflow";

type TimedCaption = { text: string; start: number; end: number };

type Props = {
  file: File | null;
  title: string;
  script: Script | null;
  captionLines: string[];
  captionStyle: CaptionStyle;
  onNotice: (message: string) => void;
};

const speechParts: Array<keyof Script> = ["hook", "gi", "seung", "jeon", "gyeol", "cta"];

function formatSrtTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

function safeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "shorts";
}

function wrapCaption(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export default function VideoVoiceoverStudio({ file, title, script, captionLines, captionStyle, onNotice }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionIndexRef = useRef(-1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputName, setOutputName] = useState("");
  const [timedCaptions, setTimedCaptions] = useState<TimedCaption[]>([]);
  const [captionIndex, setCaptionIndex] = useState(-1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const voiceList = () => {
      const available = window.speechSynthesis?.getVoices() ?? [];
      setVoices(available);
      if (!voiceURI) {
        const korean = available.find((voice) => voice.lang.toLowerCase().startsWith("ko"));
        if (korean) setVoiceURI(korean.voiceURI);
      }
    };
    voiceList();
    window.speechSynthesis?.addEventListener("voiceschanged", voiceList);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", voiceList);
  }, [voiceURI]);

  useEffect(() => {
    if (!file) {
      setVideoUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    setOutputUrl("");
    setOutputName("");
    setTimedCaptions([]);
    setCaptionIndex(-1);
    captionIndexRef.current = -1;
  }, [file, script, captionStyle]);

  useEffect(() => () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    window.speechSynthesis?.cancel();
  }, [outputUrl]);

  function speakPreview() {
    if (!script) return;
    if (!window.speechSynthesis) {
      onNotice("이 브라우저는 음성 미리듣기를 지원하지 않습니다.");
      return;
    }
    window.speechSynthesis.cancel();
    const selectedVoice = voices.find((voice) => voice.voiceURI === voiceURI);
    const text = speechParts.map((part) => script[part]).filter(Boolean).join(". ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedVoice?.lang || "ko-KR";
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
    onNotice("선택한 대본을 브라우저 음성으로 재생합니다. 출력 음성은 브라우저·기기에 따라 달라집니다.");
  }

  function downloadSrt() {
    if (!timedCaptions.length) {
      onNotice("먼저 무료 영상 녹화를 완료하면 실제 음성 구간에 맞춘 SRT 자막을 받을 수 있습니다.");
      return;
    }
    const srt = timedCaptions.map((item, index) => `${index + 1}\n${formatSrtTime(item.start)} --> ${formatSrtTime(item.end)}\n${item.text}\n`).join("\n");
    const url = URL.createObjectURL(new Blob([srt], { type: "application/x-subrip;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(title)}.srt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createFreeVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!file || !video || !canvas || !script) {
      onNotice("영상 파일을 올리고 대본 유형을 선택한 다음 실행해 주세요.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || !("MediaRecorder" in window) || !window.speechSynthesis) {
      onNotice("이 브라우저는 무료 영상 녹화에 필요한 탭 오디오 공유, MediaRecorder 또는 TTS를 지원하지 않습니다.");
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      onNotice("영상 미리보기가 준비될 때까지 잠시 기다려 주세요.");
      return;
    }

    setBusy(true);
    setTimedCaptions([]);
    setOutputUrl("");
    setCaptionIndex(-1);
    let displayStream: MediaStream | null = null;
    let composedStream: MediaStream | null = null;
    let animationFrame = 0;
    let recorder: MediaRecorder | null = null;
    const timing: TimedCaption[] = [];

    try {
      // Keep the uploaded clip's audio out of the tab capture. The captured tab
      // audio is used only for the browser TTS narrated below.
      video.muted = true;
      video.volume = 0;
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTrack = displayStream.getAudioTracks()[0];
      if (!audioTrack) throw new Error("화면 공유 창에서 현재 탭의 오디오 공유를 켜야 TTS가 영상에 포함됩니다. 원본 영상 소리는 자동으로 음소거됩니다.");

      const context = canvas.getContext("2d");
      if (!context) throw new Error("영상 합성용 캔버스를 준비하지 못했습니다.");
      const width = 1080;
      const height = 1920;
      canvas.width = width;
      canvas.height = height;

      const drawFrame = () => {
        context.fillStyle = "#111613";
        context.fillRect(0, 0, width, height);
        const videoWidth = video.videoWidth || width;
        const videoHeight = video.videoHeight || height;
        const coverScale = Math.max(width / videoWidth, height / videoHeight);
        const coverWidth = videoWidth * coverScale;
        const coverHeight = videoHeight * coverScale;
        context.save();
        context.filter = "blur(34px) brightness(0.45)";
        context.drawImage(video, (width - coverWidth) / 2, (height - coverHeight) / 2, coverWidth, coverHeight);
        context.restore();
        const containScale = Math.min(width / videoWidth, height / videoHeight);
        const displayWidth = videoWidth * containScale;
        const displayHeight = videoHeight * containScale;
        context.drawImage(video, (width - displayWidth) / 2, (height - displayHeight) / 2, displayWidth, displayHeight);

        const currentCaptionIndex = captionIndexRef.current;
        if (currentCaptionIndex >= 0 && captionLines[currentCaptionIndex]) {
          const caption = captionLines[currentCaptionIndex];
          context.font = "700 48px 'Noto Sans KR', 'Malgun Gothic', sans-serif";
          const lines = wrapCaption(context, caption, 860);
          const lineHeight = 64;
          const boxHeight = lines.length * lineHeight + 54;
          const boxX = 72;
          const boxY = height - 270 - boxHeight;
          context.fillStyle = captionStyle === "question" ? "rgba(5, 73, 78, 0.94)" : captionStyle === "emphasis" ? "rgba(18, 25, 22, 0.94)" : "rgba(18, 25, 22, 0.9)";
          roundedRect(context, boxX, boxY, width - 144, boxHeight, 28);
          context.fill();
          if (captionStyle === "emphasis") {
            context.fillStyle = "#d9f36a";
            roundedRect(context, boxX, boxY, 14, boxHeight, 7);
            context.fill();
          } else if (captionStyle === "question") {
            context.fillStyle = "#81e3d4";
            roundedRect(context, boxX + 25, boxY + 22, 12, boxHeight - 44, 6);
            context.fill();
          }
          context.fillStyle = "#ffffff";
          context.textAlign = "center";
          context.textBaseline = "middle";
          lines.forEach((line, index) => context.fillText(line, width / 2, boxY + 27 + lineHeight * index + lineHeight / 2, 850));
        }
        animationFrame = window.requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const canvasStream = canvas.captureStream(30);
      composedStream = new MediaStream([...canvasStream.getVideoTracks(), audioTrack.clone()]);
      const mimeType = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("이 브라우저에서 저장 가능한 MP4/WebM 녹화 형식을 찾지 못했습니다.");
      const chunks: BlobPart[] = [];
      recorder = new MediaRecorder(composedStream, { mimeType });
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder!.onerror = () => reject(new Error("영상 녹화 중 오류가 발생했습니다."));
        recorder!.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });
      recorder.start(500);
      setRecording(true);
      window.speechSynthesis.cancel();
      video.currentTime = 0;
      const ended = new Promise<void>((resolve) => {
        if (video.ended) resolve();
        else video.addEventListener("ended", () => resolve(), { once: true });
      });
      await video.play();
      const selectedVoice = voices.find((voice) => voice.voiceURI === voiceURI);
      const startClock = () => (performance.now() - startTime) / 1000;
      const startTime = performance.now();
      for (let index = 0; index < speechParts.length; index += 1) {
        const text = script[speechParts[index]].trim();
        if (!text) continue;
        captionIndexRef.current = index;
        setCaptionIndex(index);
        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = selectedVoice?.lang || "ko-KR";
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.rate = 1;
          utterance.onstart = () => { timing[index] = { text: captionLines[index] || text, start: startClock(), end: 0 }; };
          utterance.onend = () => {
            const caption = timing[index];
            if (caption) caption.end = startClock();
            setTimedCaptions(timing.filter((caption): caption is TimedCaption => Boolean(caption && caption.end > caption.start)));
            resolve();
          };
          utterance.onerror = (event) => reject(new Error(`TTS 재생에 실패했습니다: ${event.error}`));
          window.speechSynthesis.speak(utterance);
        });
      }
      captionIndexRef.current = -1;
      setCaptionIndex(-1);
      await ended;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      recorder.stop();
      const result = await stopped;
      if (result.size < 1024) throw new Error("녹화 파일이 비어 있습니다. 현재 탭의 오디오 공유를 확인한 뒤 다시 시도해 주세요.");
      const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const name = `${safeFileName(title)}-voiceover.${extension}`;
      setOutputUrl(URL.createObjectURL(result));
      setOutputName(name);
      setTimedCaptions(timing.filter((caption): caption is TimedCaption => Boolean(caption && caption.end > caption.start)));
      onNotice(`원본 영상 소리를 제거하고 TTS 음성과 선택한 자막을 합쳤습니다. 완성 파일을 저장해 주세요. (브라우저 녹화 형식: ${extension.toUpperCase()})`);
    } catch (error) {
      if (recorder?.state === "recording") recorder.stop();
      window.speechSynthesis.cancel();
      onNotice(error instanceof Error ? error.message : "무료 영상 녹화를 완료하지 못했습니다.");
    } finally {
      window.cancelAnimationFrame(animationFrame);
      composedStream?.getTracks().forEach((track) => track.stop());
      displayStream?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <section className="panel voiceover-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">STEP 04 / VIDEO + TTS</p><h2>영상에 음성과 자막 입히기</h2></div>
          <span className="step-tag">무료 브라우저 녹화</span>
        </div>
        <div className="empty-state small-empty"><span className="empty-symbol">▶</span><p>먼저 영상 파일을 올려 주세요.</p><small>MP4 또는 브라우저에서 재생 가능한 동영상</small></div>
      </section>
    );
  }

  return (
    <section className="panel voiceover-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">STEP 04 / VIDEO + TTS</p><h2>영상에 음성과 자막 입히기</h2></div>
        <span className="step-tag">파일은 이 브라우저 안에서 처리</span>
      </div>
      <p className="muted intro-text">업로드 영상의 원래 소리는 최종 파일에서 자동으로 제거하고, 선택한 대본의 TTS와 자막만 합쳐 무료로 녹화합니다. 화면 공유 창에서 현재 탭과 탭 오디오 공유를 선택해 주세요.</p>
      <video ref={videoRef} className="uploaded-video-preview" src={videoUrl} controls muted playsInline onVolumeChange={(event) => { const player = event.currentTarget; if (!player.muted || player.volume !== 0) { player.muted = true; player.volume = 0; } }} onLoadedMetadata={(event) => { event.currentTarget.muted = true; event.currentTarget.volume = 0; setOutputUrl(""); }} />
      <canvas ref={canvasRef} className="render-canvas" aria-hidden="true" />
      <div className="voice-controls">
        <label>
          TTS 음성 <span className="field-note">브라우저 설치 음성</span>
          <select value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)} disabled={recording || busy}>
            <option value="">기본 한국어 음성</option>
            {voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
          </select>
        </label>
        <div className="voice-actions">
          <button className="button button-quiet" type="button" onClick={speakPreview} disabled={!script || busy}>대본 음성 미리듣기</button>
          <button className="button button-accent" type="button" onClick={() => void createFreeVideo()} disabled={!script || busy}>
            {busy ? "음성·영상 녹화 중…" : recording ? "녹화 중…" : "무료로 음성·자막 입히기"}
          </button>
        </div>
      </div>
      {captionIndex >= 0 && <p className="voice-active-line">음성·자막 재생 중: {captionLines[captionIndex] || "대본"}</p>}
      {!voices.some((voice) => voice.lang.toLowerCase().startsWith("ko")) && <p className="voice-warning">한국어 TTS가 설치되어 있지 않을 수 있습니다. 음성 선택 목록에 한국어가 없다면 기기의 한국어 음성을 설치한 뒤 다시 열어 주세요.</p>}
      <div className="render-notes">
        <strong>녹화 전에 확인하세요</strong>
        <ol>
          <li>녹화 버튼을 누르면 브라우저가 화면 공유를 요청합니다.</li>
          <li>현재 Shorts Studio 탭을 고르고 ‘탭 오디오 공유’를 켜 주세요. 원본 영상 소리는 자동으로 제외됩니다.</li>
          <li>녹화 완료 후 MP4 또는 WebM 파일을 저장하고 게시 전에 직접 확인하세요.</li>
        </ol>
      </div>
      {outputUrl && (
        <div className="render-result">
          <div><strong>완성 파일 준비됨</strong><small>{outputName} · 원본 소리 제거 · TTS 음성·자막 포함</small></div>
          <div className="render-result-actions">
            <a className="button button-dark" href={outputUrl} download={outputName}>완성 영상 저장</a>
            <button className="button button-outline" type="button" onClick={downloadSrt}>SRT 자막 저장</button>
          </div>
        </div>
      )}
      {busy && <button className="button button-quiet full-width" type="button" onClick={() => { window.speechSynthesis.cancel(); videoRef.current?.pause(); }}>녹화 중단</button>}
    </section>
  );
}

