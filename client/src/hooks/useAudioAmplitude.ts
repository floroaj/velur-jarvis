import { useEffect, useRef, useState } from "react";

/**
 * Attach a Web Audio AnalyserNode to either a MediaStream or an HTMLAudioElement
 * and produce a smoothed 0..1 amplitude value updated each animation frame.
 */
export function useAudioAmplitude(source: MediaStream | HTMLAudioElement | null, active: boolean) {
  const [amplitude, setAmplitude] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!active || !source) {
      setAmplitude(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    analyserRef.current = analyser;

    let node: AudioNode;
    if (source instanceof MediaStream) {
      node = ctx.createMediaStreamSource(source);
      node.connect(analyser);
    } else {
      const mediaNode = ctx.createMediaElementSource(source);
      mediaNode.connect(analyser);
      analyser.connect(ctx.destination);
      node = mediaNode;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    const loop = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      smoothed = smoothed * 0.75 + avg * 0.25;
      setAmplitude(smoothed);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      ctx.close().catch(() => undefined);
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [source, active]);

  return amplitude;
}
