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
- [ ] ElevenLabs TTS integration (key slot ready, swap generateSpeech in tts.ts)
- [ ] Picovoice Porcupine wake-word (key slot ready, replace VAD energy detector)
- [ ] Triple Whale native connector (read KPIs on voice command via API)
- [ ] Klaviyo native connector (flow performance, segments, email revenue)
- [ ] Meta Ads connector via MCP (spend, ROAS, campaign status)
- [ ] WordPress connector (publish posts, upload media via Jarvis voice)
- [ ] Google Drive connector (read/create docs via Jarvis voice)
- [ ] Holographic data overlay cards (float near orb when Jarvis speaks numbers)
- [ ] Anomaly alert system with configurable thresholds
- [ ] Weekly review auto-briefing (Fridays)
- [ ] Mobile PWA (manifest.json + service worker + touch-to-talk)
- [ ] Multi-display wall mode

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
- [ ] WooCommerce Consumer Key/Secret vault slot (for dedicated WC API keys)
- [ ] Tool: get_woocommerce_customers (Neukunden, Lifetime Value)
- [ ] Tool: update_woocommerce_product_stock (Lagerstand per Sprache anpassen)
