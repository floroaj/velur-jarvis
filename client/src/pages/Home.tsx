/**
 * Home — Jarvis Command Center
 * Apple-minimal layout:
 * - Full-screen dark canvas
 * - Flower-of-Life 3D core centered
 * - State label + transcript ticker below
 * - Minimal pill controls
 * - Slide-up session log drawer
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Mic, MicOff, Volume2, VolumeX, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JarvisLayout } from "@/components/JarvisLayout";
import { ReactorCore } from "@/components/ReactorCore";
import { useAudioAmplitude } from "@/hooks/useAudioAmplitude";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface SessionEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  streaming?: boolean;
}

const STATE_LABELS: Record<OrbState, string> = {
  idle:      "Awaiting directive",
  listening: "Listening",
  thinking:  "Processing",
  speaking:  "Speaking",
};

// ── VAD hook (energy-based) ───────────────────────────────────────────────────
function useVAD(onSpeechStart: () => void, onSpeechEnd: () => void, enabled: boolean) {
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number>(0);
  const speakingRef  = useRef(false);
  const silenceRef   = useRef(0);
  const THRESHOLD    = 0.018;
  const SILENCE_MS   = 1200;

  useEffect(() => {
    if (!enabled) {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(rafRef.current);
      return;
    }
    let ctx: AudioContext;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        if (rms > THRESHOLD) {
          if (!speakingRef.current) { speakingRef.current = true; onSpeechStart(); }
          silenceRef.current = 0;
        } else if (speakingRef.current) {
          silenceRef.current += 16;
          if (silenceRef.current > SILENCE_MS) {
            speakingRef.current = false;
            onSpeechEnd();
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {});
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctx?.close();
    };
  }, [enabled]); // eslint-disable-line
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
const BOOT_LINES = [
  "Neural core online",
  "Connecting to API vault",
  "Loading business context",
  "Calibrating voice engine",
  "Establishing secure channel",
  "System ready",
];

function BootSequence({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone]   = useState(false);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (i < BOOT_LINES.length) {
        setLines(prev => [...prev, BOOT_LINES[i]!]);
        i++;
      } else {
        clearInterval(id);
        setTimeout(() => { setDone(true); setTimeout(onDone, 400); }, 300);
      }
    }, 280);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      animate={{ opacity: done ? 0 : 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-2 w-64">
        <p className="text-xs font-semibold text-primary mb-3 tracking-widest uppercase">Jarvis</p>
        {lines.map((line, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5 text-xs text-muted-foreground"
          >
            <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
            {line}
            {idx === lines.length - 1 && line !== "System ready" && (
              <span className="cursor-blink text-primary">_</span>
            )}
            {line === "System ready" && (
              <span className="text-primary ml-1">✓</span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  // Boot sequence only shows once per browser session
  const [booted, setBooted] = useState(() => {
    try { return sessionStorage.getItem("jarvis_booted") === "1"; } catch { return false; }
  });
  const [orbState, setOrbState]     = useState<OrbState>("idle");
  const [amplitude, setAmplitude]   = useState(0);
  const [voiceOn, setVoiceOn]       = useState(true);
  const [vadOn, setVadOn]           = useState(false);
  const [handsFree, setHandsFree]   = useState(false);
  const [recording, setRecording]   = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ticker, setTicker]         = useState("");
  const [session, setSession]       = useState<SessionEntry[]>([]);
  const [convId, setConvId]         = useState<number | undefined>();
  const [textInput, setTextInput]   = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const sessionEndRef    = useRef<HTMLDivElement>(null);

  // Amplitude from mic stream
  const micAmplitude = useAudioAmplitude(streamRef.current, orbState === "listening");
  // Amplitude from TTS audio element
  const ttsAmplitude = useAudioAmplitude(audioRef.current, orbState === "speaking");

  useEffect(() => {
    if (orbState === "listening") setAmplitude(micAmplitude);
    else if (orbState === "speaking") setAmplitude(ttsAmplitude);
    else setAmplitude(0);
  }, [orbState, micAmplitude, ttsAmplitude]);

  // Scroll session log to bottom
  useEffect(() => {
    sessionEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session]);

  // Spacebar push-to-talk
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body && !recording && orbState === "idle") {
        e.preventDefault();
        startRecording();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && recording) {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [recording, orbState]); // eslint-disable-line

  // tRPC
  const uploadAudio  = trpc.jarvis.uploadAudio.useMutation();
  const transcribe   = trpc.jarvis.transcribe.useMutation();
  const speak        = trpc.jarvis.speak.useMutation();

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording || orbState !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setOrbState("listening");
    } catch { /* mic denied */ }
  }, [recording, orbState]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mr.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      await processAudio(blob);
    };
  }, []); // eslint-disable-line

  // VAD hooks
  useVAD(
    () => { if (vadOn && orbState === "idle") startRecording(); },
    () => { if (vadOn && recording) stopRecording(); },
    vadOn,
  );

  // ── Process audio → STT → LLM stream → TTS ─────────────────────────────────
  const processAudio = async (blob: Blob) => {
    setOrbState("thinking");
    setTicker("Transcribing…");
    try {
      // Upload
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
      const dataBase64 = btoa(binary);
      const { url } = await uploadAudio.mutateAsync({ dataBase64, mimeType: "audio/webm" });

      // Transcribe
      const { text } = await transcribe.mutateAsync({ audioUrl: url, language: "de" });
      if (!text.trim()) { setOrbState("idle"); setTicker(""); return; }

      await sendMessage(text);
    } catch (err) {
      setOrbState("idle");
      setTicker("");
    }
  };

  // ── Audio chunk queue for sentence-by-sentence TTS playback ─────────────────
  const audioQueueRef   = useRef<string[]>([]);
  const playingRef      = useRef(false);

  const playNextChunk = useCallback(() => {
    if (playingRef.current || audioQueueRef.current.length === 0) return;
    const url = audioQueueRef.current.shift()!;
    playingRef.current = true;
    setOrbState("speaking");
    setTicker("Speaking…");
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      playingRef.current = false;
      audioRef.current = null;
      if (audioQueueRef.current.length > 0) {
        playNextChunk();
      } else {
        setOrbState("idle");
        setTicker("");
      }
    };
    audio.onerror = () => {
      playingRef.current = false;
      audioRef.current = null;
      if (audioQueueRef.current.length > 0) playNextChunk();
      else { setOrbState("idle"); setTicker(""); }
    };
    audio.play().catch(() => {
      playingRef.current = false;
      if (audioQueueRef.current.length > 0) playNextChunk();
      else { setOrbState("idle"); setTicker(""); }
    });
  }, []); // eslint-disable-line

  // ── Send text message via SSE stream ───────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    setTextInput("");

    // Reset audio queue
    audioQueueRef.current = [];
    playingRef.current = false;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    // Add user message
    const userId = crypto.randomUUID();
    setSession(prev => [...prev, { id: userId, role: "user", content: text }]);
    setOrbState("thinking");
    setTicker("Thinking…");

    // Add streaming assistant placeholder
    const assistantId = crypto.randomUUID();
    setSession(prev => [...prev, { id: assistantId, role: "assistant", content: "", streaming: true }]);

    try {
      const resp = await fetch("/api/jarvis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, conversationId: convId, useTool: true }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let activeTools: string[] = [];
      let firstToken = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "conversation_id") setConvId(event.conversationId);

            if (event.type === "token") {
              if (firstToken) { firstToken = false; setOrbState("thinking"); }
              fullReply += event.token;
              setTicker(fullReply.slice(-80));
              setSession(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullReply } : m,
              ));
            }

            // ── Sentence-by-sentence TTS from audio_chunk events ──────────
            if (event.type === "audio_chunk" && voiceOn && event.url) {
              audioQueueRef.current.push(event.url as string);
              playNextChunk(); // starts playing immediately if not already
            }

            if (event.type === "tool_start") {
              activeTools = (event.tools as string).split(",").map((s: string) => s.trim());
              setTicker(`Using ${activeTools.join(", ")}…`);
            }
            if (event.type === "tool_result") {
              setSession(prev => prev.map(m =>
                m.id === assistantId ? { ...m, tools: activeTools } : m,
              ));
            }
            if (event.type === "done") {
              setSession(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: event.reply as string || fullReply, streaming: false, tools: activeTools.length ? activeTools : undefined }
                  : m,
              ));
              // If voice is off OR no audio chunks were queued, go idle immediately
              if (!voiceOn || audioQueueRef.current.length === 0 && !playingRef.current) {
                setOrbState("idle");
                setTicker("");
              }
              // Otherwise the playNextChunk chain will set idle when queue drains
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setSession(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: "I encountered an error. Please try again.", streaming: false } : m,
      ));
      setOrbState("idle");
      setTicker("");
    }
  }  // ── Render ─────────────────────────────────────────────────────────────────────────
  return (
    <JarvisLayout>  {!booted && <BootSequence onDone={() => { try { sessionStorage.setItem("jarvis_booted", "1"); } catch {} setBooted(true); }} />}

      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[calc(100vh-3rem)]" style={{ position: "relative", zIndex: 10 }}>
        {/* Very subtle radial glow behind core */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: orbState === "idle"
              ? "radial-gradient(ellipse 50% 50% at 50% 50%, oklch(0.76 0.14 192 / 0.04) 0%, transparent 70%)"
              : orbState === "listening"
              ? "radial-gradient(ellipse 55% 55% at 50% 50%, oklch(0.72 0.18 145 / 0.07) 0%, transparent 70%)"
              : orbState === "thinking"
              ? "radial-gradient(ellipse 50% 50% at 50% 50%, oklch(0.78 0.14 80 / 0.06) 0%, transparent 70%)"
              : "radial-gradient(ellipse 60% 60% at 50% 50%, oklch(0.76 0.14 192 / 0.10) 0%, transparent 70%)",
            transition: "background 1s ease",
          }}
        />

        {/* Core */}
        <motion.div
          className="relative"
          animate={{ scale: booted ? 1 : 0.85, opacity: booted ? 1 : 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        >
          <ReactorCore state={orbState} amplitude={amplitude} />
        </motion.div>

        {/* State label + ticker */}
        <motion.div
          className="flex flex-col items-center gap-1.5 mt-6"
          animate={{ opacity: booted ? 1 : 0, y: booted ? 0 : 10 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            {STATE_LABELS[orbState]}
          </p>
          <AnimatePresence mode="wait">
            {ticker && (
              <motion.p
                key={ticker.slice(0, 20)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-foreground/70 max-w-xs text-center leading-snug"
              >
                {ticker}
                {orbState === "thinking" && <span className="cursor-blink ml-0.5 text-primary">_</span>}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Controls */}
        <motion.div
          className="flex flex-col items-center gap-3 mt-8"
          animate={{ opacity: booted ? 1 : 0, y: booted ? 0 : 12 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {/* Primary speak button */}
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            disabled={orbState === "thinking" || orbState === "speaking"}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all btn-press
              ${recording
                ? "bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.76_0.14_192/0.4)]"
                : orbState !== "idle"
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15"
              }
            `}
          >
            {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {recording ? "Release to send" : "Hold to speak"}
          </button>

          {/* Secondary controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHandsFree(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all btn-press border ${
                handsFree
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Zap className="w-3 h-3" />
              Hands-free
            </button>
            <button
              onClick={() => setVadOn(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all btn-press border ${
                vadOn
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Mic className="w-3 h-3" />
              VAD
            </button>
            <button
              onClick={() => setVoiceOn(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all btn-press border ${
                voiceOn
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              {voiceOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
              Voice
            </button>
          </div>

          {/* Text input */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && textInput.trim()) { sendMessage(textInput); } }}
              placeholder="Type a message…"
              className="w-64 px-4 py-2 rounded-full bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              onClick={() => sendMessage(textInput)}
              disabled={!textInput.trim() || orbState !== "idle"}
              className="px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/15 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </motion.div>

        {/* Session log drawer toggle */}
        {session.length > 0 && (
          <motion.button
            className="absolute bottom-6 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-all btn-press"
            onClick={() => setDrawerOpen(v => !v)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {drawerOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            {session.length} message{session.length !== 1 ? "s" : ""}
          </motion.button>
        )}
      </div>

      {/* ── Slide-up session drawer ────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="fixed bottom-0 left-0 right-0 z-40 h-[55vh] glass border-t border-border/50 flex flex-col"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 shrink-0">
              <p className="text-xs font-medium text-foreground">Session Log</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSession([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {session.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {/* Avatar dot */}
                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-medium mt-0.5 ${
                    msg.role === "user"
                      ? "bg-secondary border border-border text-foreground"
                      : "bg-primary/15 border border-primary/30 text-primary"
                  }`}>
                    {msg.role === "user" ? "F" : "J"}
                  </div>

                  <div className={`max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {/* Tool badges */}
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.tools.map(t => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Bubble */}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-secondary border border-border text-foreground rounded-tr-sm"
                        : "bg-primary/8 border border-primary/15 text-foreground rounded-tl-sm"
                    }`}>
                      {msg.content || (msg.streaming && <span className="cursor-blink text-primary">_</span>)}
                      {msg.streaming && msg.content && <span className="cursor-blink text-primary ml-0.5">_</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={sessionEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </JarvisLayout>
  );
}
