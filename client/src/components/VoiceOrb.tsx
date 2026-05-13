import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  state: OrbState;
  /** 0..1 amplitude from the active audio source */
  amplitude?: number;
  size?: number;
  onClick?: () => void;
};

const stateColors: Record<OrbState, { core: string; glow: string; ring: string }> = {
  idle: {
    core: "oklch(0.78 0.16 220)",
    glow: "oklch(0.82 0.22 220 / 0.55)",
    ring: "oklch(0.82 0.18 220 / 0.65)",
  },
  listening: {
    core: "oklch(0.82 0.20 195)",
    glow: "oklch(0.85 0.24 200 / 0.7)",
    ring: "oklch(0.85 0.22 200 / 0.85)",
  },
  thinking: {
    core: "oklch(0.78 0.18 295)",
    glow: "oklch(0.78 0.22 290 / 0.7)",
    ring: "oklch(0.82 0.22 290 / 0.85)",
  },
  speaking: {
    core: "oklch(0.86 0.16 75)",
    glow: "oklch(0.88 0.20 80 / 0.7)",
    ring: "oklch(0.90 0.18 80 / 0.85)",
  },
};

export function VoiceOrb({ state, amplitude = 0, size = 360, onClick }: Props) {
  const colors = stateColors[state];
  const scale = 1 + Math.min(0.25, amplitude * 0.45);
  const innerRef = useRef<HTMLDivElement>(null);

  // Drive a CSS custom prop so the canvas re-renders smoothly on every frame.
  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.style.setProperty("--amp", String(amplitude.toFixed(3)));
    }
  }, [amplitude]);

  const r = size / 2;
  const stroke = 1.5;

  return (
    <div
      ref={innerRef}
      className="relative select-none"
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      {/* Outer rotating reticle */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 rotate-slow"
        style={{ filter: `drop-shadow(0 0 22px ${colors.glow})` }}
      >
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.core} stopOpacity="0.95" />
            <stop offset="55%" stopColor={colors.core} stopOpacity="0.45" />
            <stop offset="100%" stopColor={colors.core} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orb-rim" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.ring} stopOpacity="0.9" />
            <stop offset="50%" stopColor={colors.ring} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colors.ring} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* dashed outer ring */}
        <circle
          cx={r}
          cy={r}
          r={r - 4}
          fill="none"
          stroke="url(#orb-rim)"
          strokeWidth={stroke}
          strokeDasharray="2 6"
        />
        {/* tick marks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i / 60) * Math.PI * 2;
          const long = i % 5 === 0;
          const inner = r - (long ? 18 : 12);
          const outer = r - 6;
          const x1 = r + Math.cos(angle) * inner;
          const y1 = r + Math.sin(angle) * inner;
          const x2 = r + Math.cos(angle) * outer;
          const y2 = r + Math.sin(angle) * outer;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colors.ring}
              strokeOpacity={long ? 0.8 : 0.4}
              strokeWidth={long ? 1.2 : 0.7}
            />
          );
        })}
      </svg>

      {/* Counter-rotating inner reticle */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 rotate-rev"
      >
        <circle
          cx={r}
          cy={r}
          r={r - 30}
          fill="none"
          stroke={colors.ring}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <circle
          cx={r}
          cy={r}
          r={r - 50}
          fill="none"
          stroke={colors.ring}
          strokeOpacity="0.6"
          strokeWidth="0.8"
          strokeDasharray="6 10"
        />
        {/* segments */}
        {Array.from({ length: 4 }).map((_, i) => {
          const a0 = (i / 4) * Math.PI * 2 + Math.PI / 8;
          const a1 = a0 + Math.PI / 4;
          const inner = r - 70;
          const x1 = r + Math.cos(a0) * inner;
          const y1 = r + Math.sin(a0) * inner;
          const x2 = r + Math.cos(a1) * inner;
          const y2 = r + Math.sin(a1) * inner;
          const large = 0;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${inner} ${inner} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={colors.ring}
              strokeOpacity="0.7"
              strokeWidth="1.4"
            />
          );
        })}
      </svg>

      {/* Audio reactive amplitude rings */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 60%)`,
          filter: "blur(8px)",
        }}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 240, damping: 30 }}
      />

      {/* Core sphere */}
      <motion.div
        className="absolute inset-[18%] rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, oklch(0.98 0.05 220 / 0.85), ${colors.core} 45%, oklch(0.08 0.02 235) 90%)`,
          boxShadow: `0 0 60px ${colors.glow}, inset 0 0 60px oklch(0.08 0.02 235 / 0.7)`,
        }}
        animate={{
          scale: state === "thinking" ? [0.96, 1.02, 0.96] : scale,
        }}
        transition={
          state === "thinking"
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 220, damping: 28 }
        }
      />

      {/* Inner equator highlight */}
      <div
        className="absolute inset-[24%] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, oklch(0.98 0.05 220 / 0.35) 0%, transparent 55%)",
        }}
      />

      {/* Idle pulse ring */}
      {state === "idle" && (
        <div
          className="absolute inset-[10%] rounded-full ring-pulse"
          style={{
            border: `1px solid ${colors.ring}`,
            boxShadow: `0 0 24px ${colors.glow}`,
          }}
        />
      )}

      {/* Status label */}
      <div className="absolute inset-x-0 -bottom-8 text-center font-display tracking-[0.4em] text-xs uppercase">
        <span
          style={{
            color: colors.ring,
            textShadow: `0 0 10px ${colors.glow}`,
          }}
        >
          {state === "idle" ? "Standby" : state}
        </span>
      </div>
    </div>
  );
}
