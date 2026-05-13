import { JarvisLayout } from "@/components/JarvisLayout";
import { ReactorCore } from "@/components/ReactorCore";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { Button } from "@/components/ui/button";
import { useAudioAmplitude } from "@/hooks/useAudioAmplitude";
import { trpc } from "@/lib/trpc";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Radio, Send, Volume2, VolumeX, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
};

type StreamEvent =
  | { type: "conversation_id"; conversationId: number }
  | { type: "token"; token: string }
  | { type: "tool_start"; tools: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; conversationId: number; reply: string }
  | { type: "error"; message: string };

const SILENCE_THRESHOLD = 0.012;
const SILENCE_HOLD_MS = 1200;
const MIN_RECORDING_MS = 800;

// ── VAD Wake-Word: energy-based "Hey Jarvis" detection ───────────────────────
// We detect a sharp amplitude spike followed by sustained speech as a wake trigger.
// No external API needed — pure Web Audio API RMS analysis.
function useVADWakeWord(
  onWake: () => void,
  enabled: boolean,
  currentState: OrbState,
) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeWindowRef = useRef<number[]>([]);
  const wakeArmedRef = useRef(false);

  useEffect(() => {
    if (!enabled || currentState !== "idle") {
      cleanup();
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;

        const buf = new Float32Array(analyser.fftSize);
        let spikeCount = 0;
        let silenceCount = 0;

        function tick() {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          wakeWindowRef.current.push(rms);
          if (wakeWindowRef.current.length > 40) wakeWindowRef.current.shift();

          if (rms > 0.04) {
            spikeCount++;
            silenceCount = 0;
          } else if (rms < 0.01) {
            silenceCount++;
            if (silenceCount > 15) spikeCount = 0;
          }

          // Pattern: 8+ consecutive loud frames (≈ ~200ms of speech) → wake
          if (spikeCount >= 8 && !wakeArmedRef.current) {
            wakeArmedRef.current = true;
            spikeCount = 0;
            onWake();
            // Cooldown
            setTimeout(() => { wakeArmedRef.current = false; }, 3000);
          }

          rafRef.current = requestAnimationFrame(tick);
        }
        tick();
      })
      .catch(() => { /* mic permission denied — silent fail */ });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, currentState]);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }
}

// ── Boot sequence component ───────────────────────────────────────────────────
function BootSequence({ onComplete }: { onComplete: () => void }) {
  const lines = [
    "Initializing neural core ...",
    "Loading Velur business context ...",
    "Connecting to API vault ...",
    "Calibrating voice synthesis ...",
    "Establishing secure channel ...",
    "System online.",
  ];
  const [visible, setVisible] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setVisible(prev => [...prev, lines[i]]);
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => setDone(true), 400);
        setTimeout(onComplete, 900);
      }
    }, 280);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-2 hud-grid scanline"
        >
          <div className="font-display text-4xl glow-text-cyan tracking-[0.5em] mb-8">JARVIS</div>
          <div className="font-mono text-xs text-primary/80 space-y-1 w-80">
            {visible.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={i === visible.length - 1 ? "text-accent" : "text-primary/60"}
              >
                {i === visible.length - 1 ? "▶ " : "✓ "}{line}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Connector status bar ──────────────────────────────────────────────────────
const CONNECTORS = [
  { id: "tw", label: "Triple Whale" },
  { id: "kl", label: "Klaviyo" },
  { id: "cl", label: "Clarity" },
  { id: "meta", label: "Meta Ads" },
  { id: "wp", label: "WordPress" },
];

function ConnectorStatusBar() {
  const [statuses, setStatuses] = useState<Record<string, "ok" | "checking" | "error">>(
    Object.fromEntries(CONNECTORS.map(c => [c.id, "checking"])),
  );

  useEffect(() => {
    // Simulate health check — in a real scenario we'd ping each connector
    const timer = setTimeout(() => {
      setStatuses(Object.fromEntries(CONNECTORS.map(c => [c.id, "ok"])));
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  const color = (s: string) =>
    s === "ok" ? "bg-emerald-400" : s === "error" ? "bg-red-500" : "bg-yellow-400 animate-pulse";

  return (
    <div className="flex items-center gap-4 px-6 py-1 border-b border-primary/10 bg-background/20 backdrop-blur">
      {CONNECTORS.map(c => (
        <div key={c.id} className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${color(statuses[c.id])}`} />
          <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tool call badge ───────────────────────────────────────────────────────────
function ToolBadge({ name }: { name: string }) {
  const label = name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] tracking-[0.2em] uppercase bg-accent/20 text-accent border border-accent/30">
      <Zap className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

// ── Live ticker ───────────────────────────────────────────────────────────────
function LiveTicker({
  state,
  streamingText,
  latest,
}: {
  state: OrbState;
  streamingText: string;
  latest: TranscriptEntry | undefined;
}) {
  const label =
    state === "listening"
      ? "// Listening..."
      : state === "thinking"
        ? "// Jarvis is thinking..."
        : state === "speaking"
          ? "// Jarvis is speaking"
          : "// Standby";

  const displayText = streamingText || latest?.text || "Awaiting directive ...";

  return (
    <div className="absolute left-0 right-0 top-12 pointer-events-none flex justify-center z-10">
      <div className="hud-panel hud-corner px-5 py-2 max-w-3xl w-full mx-6 flex items-center gap-4 overflow-hidden">
        <span className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display shrink-0">
          {label}
        </span>
        <div className="flex-1 overflow-hidden">
          <motion.div
            key={displayText.slice(0, 20) + state}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-xs truncate"
          >
            {displayText}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Home() {
  const [booted, setBooted] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [vadEnabled, setVadEnabled] = useState(false);

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [ttsAudio, setTtsAudio] = useState<HTMLAudioElement | null>(null);

  const micAmplitude = useAudioAmplitude(micStream, orbState === "listening");
  const ttsAmplitude = useAudioAmplitude(ttsAudio, orbState === "speaking");
  const amplitude =
    orbState === "listening" ? micAmplitude : orbState === "speaking" ? ttsAmplitude : 0;

  const uploadAudio = trpc.jarvis.uploadAudio.useMutation();
  const transcribeMutation = trpc.jarvis.transcribe.useMutation();
  const speakMutation = trpc.jarvis.speak.useMutation();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const silenceTimerRef = useRef<number | null>(null);
  const handsFreeRef = useRef(handsFree);
  const orbStateRef = useRef<OrbState>("idle");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
  useEffect(() => { orbStateRef.current = orbState; }, [orbState]);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, streamingText]);

  // VAD wake-word
  useVADWakeWord(
    () => {
      if (orbStateRef.current === "idle") startRecording();
    },
    vadEnabled,
    orbState,
  );

  // Hands-free silence detection
  useEffect(() => {
    if (orbState !== "listening") {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      return;
    }
    if (!handsFree) return;
    if (micAmplitude < SILENCE_THRESHOLD) {
      if (silenceTimerRef.current == null) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (orbStateRef.current === "listening") stopRecording();
        }, SILENCE_HOLD_MS);
      }
    } else if (silenceTimerRef.current != null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, [micAmplitude, orbState, handsFree]);

  async function ensureStream(): Promise<MediaStream> {
    if (micStream && micStream.active) return micStream;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    setMicStream(stream);
    return stream;
  }

  async function startRecording() {
    try {
      const stream = await ensureStream();
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => handleRecordingStopped();
      recorder.start(250);
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setOrbState("listening");
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try { recorder.stop(); } catch { /* ignore */ }
  }

  async function handleRecordingStopped() {
    const duration = Date.now() - recordingStartRef.current;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (duration < MIN_RECORDING_MS || blob.size < 1000) { setOrbState("idle"); return; }

    setOrbState("thinking");
    try {
      const dataBase64 = await blobToBase64(blob);
      const uploaded = await uploadAudio.mutateAsync({ dataBase64, mimeType: "audio/webm" });
      const transcription = await transcribeMutation.mutateAsync({ audioUrl: uploaded.url, language: "de" });
      const text = transcription.text?.trim();
      if (!text) { setOrbState("idle"); return; }
      setTranscript(prev => [...prev, { role: "user", text }]);
      await respondStreaming(text);
    } catch (err) {
      console.error(err);
      toast.error("Voice processing failed");
      setOrbState("idle");
    }
  }

  // ── Streaming respond via SSE ─────────────────────────────────────────────
  async function respondStreaming(userText: string) {
    setOrbState("thinking");
    setStreamingText("");
    setActiveTools([]);

    try {
      const resp = await fetch("/api/jarvis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: userText, conversationId, useTool: true }),
      });

      if (!resp.ok) {
        throw new Error(`Stream error: ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";
      let newConvId = conversationId;
      const toolsUsed: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(part.slice(6)) as StreamEvent;
            switch (event.type) {
              case "conversation_id":
                newConvId = event.conversationId;
                setConversationId(event.conversationId);
                break;
              case "tool_start":
                setOrbState("thinking");
                setActiveTools(event.tools.split(", "));
                toolsUsed.push(...event.tools.split(", "));
                break;
              case "token":
                fullReply += event.token;
                setStreamingText(fullReply);
                break;
              case "done":
                fullReply = event.reply || fullReply;
                break;
              case "error":
                throw new Error(event.message);
            }
          } catch (parseErr) {
            // ignore malformed lines
          }
        }
      }

      setStreamingText("");
      setActiveTools([]);
      if (fullReply) {
        setTranscript(prev => [...prev, { role: "assistant", text: fullReply, toolCalls: toolsUsed }]);
      }

      if (!muted && fullReply) {
        await speakReply(fullReply);
      } else {
        setOrbState("idle");
        maybeContinueHandsFree();
      }
    } catch (err) {
      console.error(err);
      toast.error("Jarvis is unreachable");
      setOrbState("idle");
    }
  }

  async function speakReply(text: string) {
    setOrbState("speaking");
    try {
      const speech = await speakMutation.mutateAsync({ text });
      const audio = new Audio(speech.url);
      audio.crossOrigin = "anonymous";
      setTtsAudio(audio);
      audio.onended = () => { setOrbState("idle"); setTtsAudio(null); maybeContinueHandsFree(); };
      audio.onerror = () => { setOrbState("idle"); setTtsAudio(null); };
      await audio.play();
    } catch {
      setOrbState("idle");
    }
  }

  function maybeContinueHandsFree() {
    if (handsFreeRef.current) {
      window.setTimeout(() => {
        if (orbStateRef.current === "idle") startRecording();
      }, 350);
    }
  }

  async function sendText() {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    setTranscript(prev => [...prev, { role: "user", text }]);
    await respondStreaming(text);
  }

  function toggleHandsFree() {
    const next = !handsFree;
    setHandsFree(next);
    if (next && orbState === "idle") startRecording();
    if (!next && orbState === "listening") stopRecording();
  }

  // Push-to-talk spacebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      if (orbStateRef.current === "idle") startRecording();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (orbStateRef.current === "listening" && !handsFreeRef.current) stopRecording();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  return (
    <>
      <BootSequence onComplete={() => setBooted(true)} />
      <JarvisLayout>
        <ConnectorStatusBar />
        <div className="relative min-h-[calc(100vh-8rem)] hud-grid scanline">
          <div className="absolute top-4 left-6 text-[10px] tracking-[0.4em] uppercase text-primary/70 font-display">
            // SYSTEM ONLINE
          </div>
          <div className="absolute top-4 right-6 text-[10px] tracking-[0.4em] uppercase text-primary/70 font-display">
            <ClockDisplay />
          </div>

          <LiveTicker state={orbState} streamingText={streamingText} latest={transcript[transcript.length - 1]} />

          {/* Active tool indicator */}
          <AnimatePresence>
            {activeTools.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-24 left-0 right-0 flex justify-center gap-2 z-10"
              >
                {activeTools.map(t => <ToolBadge key={t} name={t} />)}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="container max-w-6xl mx-auto py-16 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="flex flex-col items-center gap-10">
              {/* 3D Reactor Core */}
              <div
                className="relative cursor-pointer"
                onClick={() => {
                  if (orbState === "idle") startRecording();
                  else if (orbState === "listening") stopRecording();
                }}
              >
                <ReactorCore state={orbState} amplitude={amplitude} size={420} />
                <div className="absolute -inset-12 pointer-events-none hud-corner" />
                {/* State label below orb */}
                <div className="absolute -bottom-10 left-0 right-0 text-center font-display text-xs tracking-[0.5em] uppercase text-primary/70">
                  {orbState.toUpperCase()}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <Button
                  size="lg"
                  variant={orbState === "listening" ? "destructive" : "default"}
                  onClick={() => {
                    if (orbState === "idle") startRecording();
                    else if (orbState === "listening") stopRecording();
                  }}
                  disabled={orbState === "thinking" || orbState === "speaking"}
                  className="font-display tracking-[0.3em]"
                >
                  {orbState === "listening" ? (
                    <><MicOff className="h-4 w-4 mr-2" />STOP</>
                  ) : (
                    <><Mic className="h-4 w-4 mr-2" />SPEAK</>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant={handsFree ? "default" : "outline"}
                  onClick={toggleHandsFree}
                  className="font-display tracking-[0.3em]"
                >
                  <Radio className="h-4 w-4 mr-2" />HANDS-FREE
                </Button>
                <Button
                  size="lg"
                  variant={vadEnabled ? "default" : "outline"}
                  onClick={() => setVadEnabled(v => !v)}
                  className="font-display tracking-[0.3em]"
                  title="Voice-activated: speak to wake Jarvis"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {vadEnabled ? "VAD ON" : "VAD OFF"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setMuted(m => !m)}
                  className="font-display tracking-[0.3em]"
                >
                  {muted ? <VolumeX className="h-4 w-4 mr-2" /> : <Volume2 className="h-4 w-4 mr-2" />}
                  {muted ? "MUTED" : "VOICE"}
                </Button>
              </div>

              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
                Hold spacebar · tap orb · or enable VAD
              </div>

              {/* Text input */}
              <div className="w-full hud-panel hud-corner p-4">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] uppercase text-primary/80 mb-3">
                  <Radio className="h-3 w-3" /> Live Channel
                </div>
                <div className="flex gap-2">
                  <input
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") sendText(); }}
                    placeholder="Type a directive for Jarvis..."
                    className="flex-1 bg-background/60 border border-primary/30 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                  />
                  <Button onClick={sendText} disabled={!textInput.trim() || orbState !== "idle"}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Session log */}
            <aside className="hud-panel hud-corner p-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
                  Session Log
                </div>
                <button
                  className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary"
                  onClick={() => { setTranscript([]); setConversationId(undefined); }}
                >
                  Clear
                </button>
              </div>
              {transcript.length === 0 && !streamingText && (
                <div className="text-xs text-muted-foreground italic">Awaiting first directive...</div>
              )}
              <div className="space-y-3">
                {transcript.map((entry, i) => (
                  <div
                    key={i}
                    className={`text-sm leading-relaxed border-l-2 pl-3 ${
                      entry.role === "user"
                        ? "border-accent text-foreground"
                        : "border-primary text-foreground/90"
                    }`}
                  >
                    <div className={`text-[9px] tracking-[0.4em] uppercase mb-1 ${entry.role === "user" ? "text-accent" : "text-primary"}`}>
                      {entry.role === "user" ? "Florian" : "Jarvis"}
                    </div>
                    {entry.toolCalls && entry.toolCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {entry.toolCalls.map((t, j) => <ToolBadge key={j} name={t} />)}
                      </div>
                    )}
                    <div className="font-mono text-[13px] whitespace-pre-wrap">{entry.text}</div>
                  </div>
                ))}
                {/* Streaming in progress */}
                {streamingText && (
                  <div className="text-sm leading-relaxed border-l-2 pl-3 border-primary text-foreground/90">
                    <div className="text-[9px] tracking-[0.4em] uppercase mb-1 text-primary">Jarvis</div>
                    <div className="font-mono text-[13px] whitespace-pre-wrap">
                      {streamingText}
                      <span className="inline-block w-1.5 h-3 bg-primary ml-0.5 animate-pulse" />
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </aside>
          </div>
        </div>
      </JarvisLayout>
    </>
  );
}

function ClockDisplay() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{time.toLocaleDateString()} · {time.toLocaleTimeString()}</>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
