# Shorts Studio

A local-first Korean Shorts workflow dashboard for collecting source notes, scoring pasted comment signals, drafting a hook-to-CTA script, and reviewing three subtitle styles.

## Current behavior

- Source links, notes, public view/like counts, and pasted comments can be entered manually.
- The interest score is a transparent heuristic. It combines reach (15%), engagement (20%), comment volume (20%), product-intent comments (30%), and question demand (15%).
- The script draft has hook, 기, 승, 전, 결, and CTA sections. Every draft remains editable.
- The three subtitle treatments are 기본형, 강조형, and 질문형. The configured CTA is 제품정보나 설치원하면 댓글남기고 팔로우해주세요.
- Sources and drafts are stored in the current browser's local storage. They are not sent to an API.
- The approval control changes a local review status only. It is not a server-side authorization check. Video generation, direct messages, and publishing are not wired to an external service.
- Script creation is a deterministic editable template. An AI rewrite provider has not been connected.

## Integration boundary

The assistant-side VerseIn connection can list available models without generating media. Image or video generation consumes VerseIn coins and needs approval for the specific job. This app does not call VerseIn yet.

The GitHub repository `hearthk21-source/shorts-auto` is available for this project. The Vercel project `shorts-automation` exists, but its team currently has no linked Git projects and the Vercel GitHub namespace is unavailable in this session. Linking Vercel to GitHub requires that provider authorization; deployment remains a separate approval step.

Automated social-platform collection, AI rewriting, persistent database storage, VerseIn generation, direct messages, and publishing are not wired to external services yet. Do not put OAuth tokens, API keys, or other credentials in source files or browser storage.

