import { JarvisLayout } from "@/components/JarvisLayout";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { Button } from "@/components/ui/button";
import { useAudioAmplitude } from "@/hooks/useAudioAmplitude";
import { trpc } from "@/lib/trpc";
import { Mic, MicOff, Radio, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

const SILENCE_THRESHOLD = 0.012;
const SILENCE_HOLD_MS = 1200;
const MIN_RECORDING_MS = 800;

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsAudio, setTtsAudio] = useState<HTMLAudioElement | null>(null);

  const micAmplitude = useAudioAmplitude(micStream, orbState === "listening");
  const ttsAmplitude = useAudioAmplitude(ttsAudio, orbState === "speaking");

  const amplitude =
    orbState === "listening" ? micAmplitude : orbState === "speaking" ? ttsAmplitude : 0;

  const uploadAudio = trpc.jarvis.uploadAudio.useMutation();
  const transcribeMutation = trpc.jarvis.transcribe.useMutation();
  const sendMessageMutation = trpc.jarvis.sendMessage.useMutation();
  const speakMutation = trpc.jarvis.speak.useMutation();

  // Recording infrastructure
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const silenceTimerRef = useRef<number | null>(null);
  const handsFreeRef = useRef(handsFree);
  const orbStateRef = useRef<OrbState>("idle");

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    orbStateRef.current = orbState;
  }, [orbState]);

  // Hands-free silence detection: when listening and amplitude stays low → auto stop
  useEffect(() => {
    if (orbState !== "listening") {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }
    if (!handsFree) return;

    if (micAmplitude < SILENCE_THRESHOLD) {
      if (silenceTimerRef.current == null) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (orbStateRef.current === "listening") {
            stopRecording();
          }
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
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleRecordingStopped();
      recorder.start(250);
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setOrbState("listening");
    } catch (err) {
      console.error(err);
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
  }

  async function handleRecordingStopped() {
    const duration = Date.now() - recordingStartRef.current;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (duration < MIN_RECORDING_MS || blob.size < 1000) {
      setOrbState("idle");
      return;
    }

    setOrbState("thinking");
    try {
      const dataBase64 = await blobToBase64(blob);
      const uploaded = await uploadAudio.mutateAsync({
        dataBase64,
        mimeType: "audio/webm",
      });
      const transcription = await transcribeMutation.mutateAsync({
        audioUrl: uploaded.url,
        language: "de",
      });
      const text = transcription.text?.trim();
      if (!text) {
        setOrbState("idle");
        return;
      }
      setTranscript(prev => [...prev, { role: "user", text }]);
      await respond(text);
    } catch (err) {
      console.error(err);
      toast.error("Voice processing failed");
      setOrbState("idle");
    }
  }

  async function respond(userText: string) {
    setOrbState("thinking");
    try {
      const result = await sendMessageMutation.mutateAsync({
        conversationId,
        text: userText,
      });
      setConversationId(result.conversationId);
      setTranscript(prev => [...prev, { role: "assistant", text: result.reply }]);

      if (!muted && result.reply) {
        await speakReply(result.reply);
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
      audio.onended = () => {
        setOrbState("idle");
        setTtsAudio(null);
        maybeContinueHandsFree();
      };
      audio.onerror = () => {
        setOrbState("idle");
        setTtsAudio(null);
      };
      await audio.play();
    } catch (err) {
      console.error(err);
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
    await respond(text);
  }

  function toggleHandsFree() {
    const next = !handsFree;
    setHandsFree(next);
    if (next && orbState === "idle") {
      startRecording();
    }
    if (!next && orbState === "listening") {
      stopRecording();
    }
  }

  // Push-to-talk via spacebar
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
      if (orbStateRef.current === "listening" && !handsFreeRef.current) {
        stopRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <JarvisLayout>
      <div className="relative min-h-[calc(100vh-8rem)] hud-grid scanline">
        <div className="absolute top-4 left-6 text-[10px] tracking-[0.4em] uppercase text-primary/70 font-display">
          // SYSTEM ONLINE
        </div>
        <div className="absolute top-4 right-6 text-[10px] tracking-[0.4em] uppercase text-primary/70 font-display">
          {new Date().toLocaleDateString()} · {new Date().toLocaleTimeString()}
        </div>

        <LiveTicker state={orbState} latest={transcript[transcript.length - 1]} />

        <div className="container max-w-6xl mx-auto py-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
          <div className="flex flex-col items-center gap-12">
            <div className="relative">
              <VoiceOrb
                state={orbState}
                amplitude={amplitude}
                size={420}
                onClick={() => {
                  if (orbState === "idle") startRecording();
                  else if (orbState === "listening") stopRecording();
                }}
              />
              <div className="absolute -inset-12 pointer-events-none hud-corner" />
            </div>

            <div className="flex items-center gap-3 mt-6">
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
                  <>
                    <MicOff className="h-4 w-4 mr-2" />
                    STOP
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    SPEAK
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant={handsFree ? "default" : "outline"}
                onClick={toggleHandsFree}
                className="font-display tracking-[0.3em]"
              >
                <Radio className="h-4 w-4 mr-2" />
                HANDS-FREE
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
              Hold spacebar or tap the orb to talk
            </div>

            <div className="w-full hud-panel hud-corner p-4">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] uppercase text-primary/80 mb-3">
                <Radio className="h-3 w-3" /> Live Channel
              </div>
              <div className="flex gap-2">
                <input
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") sendText();
                  }}
                  placeholder="Type a directive for Jarvis..."
                  className="flex-1 bg-background/60 border border-primary/30 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                />
                <Button onClick={sendText} disabled={!textInput.trim() || orbState !== "idle"}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <aside className="hud-panel hud-corner p-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
                Session Log
              </div>
              <button
                className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary"
                onClick={() => {
                  setTranscript([]);
                  setConversationId(undefined);
                }}
              >
                Clear
              </button>
            </div>
            {transcript.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                Awaiting first directive...
              </div>
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
                  <div
                    className={`text-[9px] tracking-[0.4em] uppercase mb-1 ${
                      entry.role === "user" ? "text-accent" : "text-primary"
                    }`}
                  >
                    {entry.role === "user" ? "Florian" : "Jarvis"}
                  </div>
                  <div className="font-mono text-[13px] whitespace-pre-wrap">{entry.text}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </JarvisLayout>
  );
}

function LiveTicker({
  state,
  latest,
}: {
  state: OrbState;
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
  const text = latest?.text ?? "";
  return (
    <div className="absolute left-0 right-0 top-12 pointer-events-none flex justify-center">
      <div className="hud-panel hud-corner px-5 py-2 max-w-3xl w-full mx-6 flex items-center gap-4 overflow-hidden">
        <span className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display shrink-0">
          {label}
        </span>
        <div className="flex-1 overflow-hidden">
          <div
            key={text + state}
            className="font-mono text-xs whitespace-nowrap"
            style={{
              animation: text ? "ticker-scroll 22s linear infinite" : undefined,
            }}
          >
            {text || "Awaiting directive ..."}
          </div>
        </div>
      </div>
      <style>{`@keyframes ticker-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }`}</style>
    </div>
  );
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
