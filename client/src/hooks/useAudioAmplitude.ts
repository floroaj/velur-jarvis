import { useEffect, useRef } from "react";

/**
 * Attach a Web Audio AnalyserNode to either a MediaStream or an HTMLAudioElement
 * and produce a smoothed 0..1 amplitude value stored in a MutableRefObject.
 *
 * IMPORTANT: Returns a ref (not state) so that 60fps amplitude updates do NOT
 * trigger React re-renders on the parent component. ReactorCore reads the ref
 * value directly inside its useFrame loop, which runs on the GPU render thread
 * and is completely decoupled from React's render cycle.
 */
export function useAudioAmplitude(
  source: MediaStream | HTMLAudioElement | null,
  active: boolean,
): React.MutableRefObject<number> {
  const amplitudeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !source) {
      amplitudeRef.current = 0;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

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
      for (let i = 0; i < data.length; i++) sum += data[i]!;
      const avg = sum / data.length / 255;
      smoothed = smoothed * 0.75 + avg * 0.25;
      // Write to ref — no setState, no React re-render
      amplitudeRef.current = smoothed;
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      amplitudeRef.current = 0;
      try { node.disconnect(); } catch { /* ignore */ }
      try { analyser.disconnect(); } catch { /* ignore */ }
      ctx.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, [source, active]);

  return amplitudeRef;
}
