/**
 * 3D Reactor Core — Iron Man Arc Reactor inspired
 * Uses React Three Fiber + Drei + Postprocessing
 * Audio-reactive via amplitude prop
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import type { OrbState } from "./VoiceOrb";

// State → color map
const STATE_COLORS: Record<OrbState, [number, number, number]> = {
  idle: [0.0, 0.8, 1.0],       // cyan
  listening: [0.0, 1.0, 0.6],  // green-cyan
  thinking: [1.0, 0.75, 0.0],  // gold
  speaking: [0.0, 0.9, 1.0],   // bright cyan
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ── Inner glowing sphere ──────────────────────────────────────────────────────
function CoreSphere({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const targetColor = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 1 + amplitude * 0.35 + Math.sin(t * 2.5) * 0.02;
    meshRef.current.scale.setScalar(pulse);
    matRef.current.color.lerp(targetColor, 0.08);
    matRef.current.emissive.lerp(targetColor, 0.06);
    matRef.current.emissiveIntensity = 1.2 + amplitude * 2.5;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        ref={matRef}
        color={new THREE.Color(...STATE_COLORS[state])}
        emissive={new THREE.Color(...STATE_COLORS[state])}
        emissiveIntensity={1.2}
        roughness={0.1}
        metalness={0.6}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

// ── Rotating ring ─────────────────────────────────────────────────────────────
function Ring({
  radius,
  speed,
  tiltX,
  tiltZ,
  state,
  amplitude,
}: {
  radius: number;
  speed: number;
  tiltX: number;
  tiltZ: number;
  state: OrbState;
  amplitude: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const targetColor = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    meshRef.current.rotation.y = t * speed;
    meshRef.current.rotation.x = tiltX + Math.sin(t * 0.4) * 0.05;
    meshRef.current.rotation.z = tiltZ;
    matRef.current.color.lerp(targetColor, 0.05);
    matRef.current.emissive.lerp(targetColor, 0.05);
    matRef.current.emissiveIntensity = 0.8 + amplitude * 1.5;
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, 0.025, 16, 120]} />
      <meshStandardMaterial
        ref={matRef}
        color={new THREE.Color(...STATE_COLORS[state])}
        emissive={new THREE.Color(...STATE_COLORS[state])}
        emissiveIntensity={0.8}
        roughness={0.05}
        metalness={0.9}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// ── Particle field ────────────────────────────────────────────────────────────
function ParticleField({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const COUNT = 180;
  const posRef = useRef<THREE.BufferAttribute>(null!);
  const meshRef = useRef<THREE.Points>(null!);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 1.6 + Math.random() * 1.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }
    return { positions, velocities };
  }, []);

  const color = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(() => {
    if (!posRef.current) return;
    const arr = posRef.current.array as Float32Array;
    const boost = 1 + amplitude * 4;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] += velocities[i * 3] * boost;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * boost;
      arr[i * 3 + 2] += velocities[i * 3 + 2] * boost;
      const dist = Math.sqrt(arr[i * 3] ** 2 + arr[i * 3 + 1] ** 2 + arr[i * 3 + 2] ** 2);
      if (dist > 3.2 || dist < 1.4) {
        velocities[i * 3] *= -1;
        velocities[i * 3 + 1] *= -1;
        velocities[i * 3 + 2] *= -1;
      }
    }
    posRef.current.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          ref={posRef}
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.7}
      />
    </points>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ state, amplitude }: { state: OrbState; amplitude: number }) {
  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, 3]} intensity={2} color="#00e5ff" />
      <pointLight position={[0, 0, -3]} intensity={1} color="#00e5ff" />

      <CoreSphere state={state} amplitude={amplitude} />

      <Ring radius={1.35} speed={0.6} tiltX={0.4} tiltZ={0} state={state} amplitude={amplitude} />
      <Ring radius={1.55} speed={-0.4} tiltX={-0.3} tiltZ={0.5} state={state} amplitude={amplitude} />
      <Ring radius={1.75} speed={0.25} tiltX={0.8} tiltZ={-0.3} state={state} amplitude={amplitude} />
      <Ring radius={1.95} speed={-0.18} tiltX={0.2} tiltZ={0.7} state={state} amplitude={amplitude} />

      <ParticleField state={state} amplitude={amplitude} />

      <EffectComposer>
        <Bloom
          intensity={1.8}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

// ── Exported component ────────────────────────────────────────────────────────
export function ReactorCore({
  state,
  amplitude,
  size = 420,
}: {
  state: OrbState;
  amplitude: number;
  size?: number;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className="cursor-pointer select-none"
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene state={state} amplitude={amplitude} />
      </Canvas>
    </div>
  );
}
