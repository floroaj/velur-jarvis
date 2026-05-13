# Velur Jarvis – Project TODO

## Foundation
- [x] Database schema: conversations, messages, business_context, api_keys (encrypted), tasks, task_runs
- [x] AES-256-GCM encryption helper for API key vault (server-side, JWT_SECRET-derived key)
- [x] Owner-only `ownerProcedure` guard using OWNER_OPEN_ID
- [x] Drizzle migration generated and applied

## Backend (tRPC)
- [x] `jarvis.sendMessage` – persist user msg, build dynamic system prompt with business context, run LLM, persist reply
- [x] `jarvis.listConversations`, `getConversation`, `newConversation`, `renameConversation`, `deleteConversation`
- [x] `jarvis.uploadAudio` + `jarvis.transcribe` (Whisper) for voice input
- [x] `jarvis.speak` – TTS via Manus built-in API, returns audio URL
- [x] `jarvis.getContext` / `updateContext` – business context (brand, mission, voice, instructions, extra blocks)
- [x] `jarvis.vaultList` / `vaultUpsert` / `vaultReveal` / `vaultDelete` – encrypted API key vault
- [x] `jarvis.tasksList` / `taskUpsert` / `taskDelete` / `taskRun` / `taskRuns` – named webhooks / actions
- [x] `taskRun` resolves `{{vault:LABEL}}` placeholders from the vault before executing HTTP request

## Frontend – Theme & Layout
- [x] Dark HUD theme in `index.css` (deep navy/black background, cyan/gold HUD accents, Orbitron + Rajdhani fonts)
- [x] JarvisLayout (custom HUD shell with header nav, status bar, owner gate)
- [x] App.tsx routes: /, /conversations, /context, /vault, /tasks

## Frontend – Voice Orb (Centerpiece)
- [x] Animated circular voice orb component (SVG + Framer Motion) reacting to mic input level
- [x] Visual states: idle, listening, thinking, speaking (color shifts + concentric rings)
- [x] Status overlay text (Standby / Listening / Thinking / Speaking)
- [x] Web Audio API analyser to drive orb amplitude in real time

## Frontend – Pages
- [x] Home: central orb, push-to-talk (spacebar) + hands-free toggle, live transcript ticker, text fallback
- [x] Conversations: scrollable transcript log, conversation list, delete
- [x] Business Context: editor for brand/mission/voice/products/instructions + extra memory blocks
- [x] API Vault: list + add/edit/delete encrypted keys with reveal toggle
- [x] Tasks: manage HTTP webhooks/actions, run-now, view recent runs

## Voice Loop
- [x] MediaRecorder mic capture (webm/opus)
- [x] Hands-free silence detection auto-stops recording
- [x] Upload audio via storage → Whisper transcribe
- [x] Generate LLM reply → TTS → autoplay; orb amplitude follows TTS audio
- [x] Spacebar push-to-talk

## Security & Polish
- [x] All Jarvis endpoints guarded by `ownerProcedure` (owner-only)
- [x] Vault values masked by default with explicit reveal action
- [x] Vitest coverage for vault encryption (3 tests passing)

## Delivery
- [x] Owner-only client gate in JarvisLayout (admin role)
- [x] Live transcript ticker overlay near the orb
- [x] Checkpoint
- [x] Hand off to Florian with usage guide

## Future Enhancements
- [ ] Streaming LLM responses via SSE/WebSocket for faster perceived latency
- [ ] Wake-word detection ("Hey Jarvis") via Picovoice/Porcupine
- [ ] Tool-calling: let Jarvis trigger tasks autonomously when commanded
- [ ] Triple Whale / Klaviyo / Meta Ads first-class connectors (read KPIs on voice command)
- [ ] WordPress content workflows (publish blog posts directly via Jarvis)
- [ ] Per-task scheduling via heartbeat cron
