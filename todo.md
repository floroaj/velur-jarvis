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
- [x] SSE streaming endpoint `/api/jarvis/stream` for token-by-token LLM responses
- [x] Tool-calling infrastructure in SSE handler (function schema, execution loop, tool audit display)
- [x] `jarvis.setupSchedule` – registers morning briefing heartbeat cron

## Frontend – Theme & Layout
- [x] Dark HUD theme in `index.css` (deep navy/black background, cyan/gold HUD accents, Orbitron + Rajdhani fonts)
- [x] JarvisLayout (custom HUD shell with header nav, status bar, owner gate)
- [x] App.tsx routes: /, /conversations, /context, /vault, /tasks
- [x] Connector status bar (Triple Whale, Klaviyo, Clarity, Meta Ads, WordPress) with LED indicators
- [x] Boot sequence animation on first load (6-step diagnostic ticker)
- [x] Clock display with live update in header

## Frontend – 3D Reactor Core (Centerpiece)
- [x] Three.js + @react-three/fiber + @react-three/postprocessing installed
- [x] 3D sphere with emissive material, 4 rotating rings, particle field, Bloom post-processing
- [x] Audio-reactive amplitude drives sphere scale and emissive intensity
- [x] State-based color transitions: idle=cyan, listening=green, thinking=gold, speaking=bright-cyan
- [x] Fallback 2D VoiceOrb component retained for reference

## Frontend – Voice & Streaming
- [x] Streaming SSE consumer: token-by-token text appears in session log with cursor blink
- [x] Tool badge display in session log (shows which connectors Jarvis used)
- [x] Active tool indicator overlay during tool execution
- [x] VAD wake-word (energy-based RMS threshold, no external key)
- [x] VAD ON/OFF toggle button in controls
- [x] Live streaming text in ticker bar during thinking/speaking

## Frontend – Pages
- [x] Home: 3D reactor core, push-to-talk (spacebar) + hands-free + VAD, streaming session log, text fallback
- [x] Conversations: scrollable transcript log, conversation list, delete
- [x] Business Context: editor for brand/mission/voice/products/instructions + extra memory blocks
- [x] API Vault: list + add/edit/delete encrypted keys with reveal toggle
- [x] Tasks: manage HTTP webhooks/actions, run-now, view recent runs

## Voice Loop
- [x] MediaRecorder mic capture (webm/opus)
- [x] Hands-free silence detection auto-stops recording
- [x] Upload audio via storage → Whisper transcribe
- [x] Generate LLM reply via SSE stream → TTS → autoplay; orb amplitude follows TTS audio
- [x] Spacebar push-to-talk
- [x] VAD energy-based auto-trigger

## Scheduled Jobs
- [x] Morning briefing cron registered (07:00 UTC = 09:00 CEST daily)

## Security & Polish
- [x] All Jarvis endpoints guarded by `ownerProcedure` (owner-only)
- [x] Vault values masked by default with explicit reveal action
- [x] Client-side owner gate in JarvisLayout (admin role check)

## Tests
- [x] Vault encryption roundtrip, IV randomization, masking (3 tests)
- [x] Auth logout cookie clearing (1 test)
- [x] Streaming: vault interpolation, tool name parsing, SSE formatting, system prompt builder (12 tests)
- [x] Total: 16 tests passing

## Future Enhancements (next iteration)
- [ ] ElevenLabs TTS integration — BLOCKED: awaiting ElevenLabs API key from Florian
- [ ] Picovoice Porcupine wake-word — BLOCKED: awaiting Picovoice API key from Florian
- [x] Triple Whale connector (fetchTripleWhaleSummary: vault key → orders/attribution API, 2 fallback endpoints)
- [x] Klaviyo connector (fetchKlaviyoSummary: vault key → metrics API with date filter)
- [x] Clarity connector (fetchClaritySummary: vault key → projects API with date range)
- [x] Meta Ads connector (fetchMetaAdsSummary: MCP CLI → get_ad_accounts + get_insights with spend/ROAS/CPC)
- [x] WordPress connector (tools: create_wordpress_post + upload_wordpress_media)
- [ ] Google Drive connector [Future — no key yet]
- [ ] Holographic data overlay cards [Future]
- [ ] Anomaly alert system with configurable thresholds [Future]
- [x] Weekly review auto-briefing (Fridays at 10:00 CEST via heartbeat cron)
- [x] Mobile PWA (manifest.json + service worker + Apple meta tags)
- [ ] Multi-display wall mode [Future]

## Redesign – Apple-Minimal + Flower-of-Life Core
- [x] New CSS theme: deep black background, Inter font, Apple-style minimal UI, no HUD clutter
- [x] Flower-of-Life 3D Core in Three.js: hexagonal sphere grid + organic outer shell + teal glow + Bloom
- [x] New JarvisLayout: minimal top bar, no sidebar, full-screen centered core
- [x] New Home page: centered core, minimal controls below, slide-up session drawer
- [x] Connector status as subtle dots in top bar only
- [x] Boot sequence: minimal fade-in, no diagnostic ticker
- [x] Conversations page: Apple-minimal chat bubbles, clean sidebar
- [x] Vault page: clean card list, minimal dialog
- [x] Business Context page: clean form sections, no HUD classes
- [x] Tasks page: clean task cards with method color badges, inline run history

## WooCommerce Connector
- [x] Tool: get_woocommerce_summary (Revenue, Orders, AOV, Top-Produkte)
- [x] Tool: get_woocommerce_orders (letzte N Bestellungen, Status, Kunde, Total)
- [x] Tool: get_woocommerce_products (Produkte, Preis, Lagerstand, Sales)
- [x] WooCommerce credentials via WordPress Application Password (same as WP connector)
- [x] WooCommerce credentials secured via WORDPRESS_APP_PASSWORD env secret (no hardcoded creds)
- [x] Tool: get_woocommerce_customers (Neukunden, Lifetime Value)
- [x] Tool: update_woocommerce_product_stock (Lagerstand per Sprache anpassen)

## Performance & Intelligence Upgrade – Phase 1
- [x] LLM model upgrade: JARVIS_MODEL env var, default gemini-2.5-flash (strongest available via forge)
- [x] Thinking budget: JARVIS_THINKING_BUDGET env var, default 4096 tokens
- [x] invokeLLMStream: real token streaming via forge SSE format (AsyncGenerator<{token?,toolCalls?}>)
- [x] Replace fake word-loop in jarvisStream.ts with real token stream
- [x] Sentence-boundary detection during streaming (handles z.B., Dr., etc.) via SentenceAccumulator
- [x] Sentence-by-sentence TTS: audio_chunk SSE events sent as each sentence completes
- [x] Frontend audio queue: sequential playback of audio_chunk events (playNextChunk chain)
- [x] Parallel tool execution via Promise.all in tool-calling loop
- [x] Tool-result cache: server/_core/toolCache.ts (sha256 key, per-tool TTL, side-effect bypass)
- [x] WordPress credentials from Vault (WordPress_User + WordPress_AppPassword labels)
- [x] Tests: toolCache hit/miss/side-effect-bypass/key-determinism (4 tests)
- [x] Tests: sentence splitter abbreviations, boundaries, finalize, edge cases (5 tests)
- [x] Tests: SSE format + audio_chunk event shape (2 tests)
- [x] All 30 tests green (5 test files)

## PR: G+H+J+K + Nachzügler A/B/I (COMPLETE)
- [x] A-fix: hardcoded "floroaj" Fallback entfernt, klare Fehlermeldung wenn WordPress_User fehlt
- [x] B-fix: Forge-Gateway getestet — routet alles auf gemini-2.5-flash (kein Claude verfügbar), dokumentiert in llm.ts
- [x] G: server/_core/connectorHealth.ts (5 Ping-Funktionen, 4s Timeout, 30s Cache)
- [x] G: tRPC jarvis.connectorHealth ownerProcedure (Promise.all alle 5 Pings)
- [x] G: Connector-Status im buildSystemPrompt injiziert (pingAllConnectors + formatHealthForSystemPrompt)
- [x] G: Frontend ConnectorStatusBar mit echten Live-LEDs via tRPC connectorHealth
- [x] H: Boot-Sequence nur einmal pro Session (sessionStorage.jarvis_booted)
- [x] I: Conversation History Summarization (>20 Messages → LLM-Summary, DB-Cache in summaryCache column)
- [x] J: FlowerCore.tsx gelöscht, Home auf ReactorCore zurückgestellt
- [x] K: JarvisLayout-Header mit ConnectorStatusBar restauriert
- [x] Tests: connectorHealth (3 Tests: format, null-guard, error-status)
- [x] Tests: historySummarizer (3 Tests: pass-through, system-filter, fallback)
- [x] Alle 39 Tests grün (6 Test-Dateien)
