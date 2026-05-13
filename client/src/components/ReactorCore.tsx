/**
 * 3D Reactor Core — Iron Man Arc Reactor inspired
 * Uses React Three Fiber + Drei + Postprocessing
 * Audio-reactive via amplitude prop
 *
 * Upgrades (vs. baseline):
 *  - HDRI Environment for chrome reflections on rings
 *  - Fresnel rim glow shader around the core
 *  - Inner icosahedron wireframe (arc-reactor energy core)
 *  - Slow auto-orbit camera for depth
 *  - Vignette + ChromaticAberration post-FX (cinematic, tones down brightness at edges)
 *  - Spiral energy-flow particles around the Y axis
 *  - Toned-down exposure / bloom / env intensity for moodier look
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbState } from "./VoiceOrb";

// State → color map
const STATE_COLORS: Record<OrbState, [number, number, number]> = {
  idle: [0.0, 0.8, 1.0],       // cyan
  listening: [0.0, 1.0, 0.6],  // green-cyan
  thinking: [1.0, 0.75, 0.0],  // gold
  speaking: [0.0, 0.9, 1.0],   // bright cyan
};

// Per-state glow profile. Idle / listening / thinking stay very dim even at
// peak amplitude. Speaking ignites the core with strong amplitude-driven glow.
type GlowProfile = { core: number; fresnel: number; inner: number; ampMul: number };
const STATE_GLOW: Record<OrbState, GlowProfile> = {
  idle:      { core: 0.04, fresnel: 0.08, inner: 0.18, ampMul: 0.35 },
  listening: { core: 0.07, fresnel: 0.14, inner: 0.26, ampMul: 0.55 },
  thinking:  { core: 0.09, fresnel: 0.18, inner: 0.30, ampMul: 0.70 },
  speaking:  { core: 0.55, fresnel: 0.90, inner: 0.65, ampMul: 3.40 },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ── Procedural environment (no CDN, no external HDR file) ──────────────────────
// Empty deps array ensures the env texture is created ONCE per mount.
// Cleanup disposes GPU resources on unmount (handles React StrictMode double-invoke).
function ProceduralEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    return () => {
      scene.environment = null;
      envTexture.dispose();
      pmrem.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — gl and scene refs are stable
  return null;
}

// ── Slow auto-orbit camera ────────────────────────────────────────────────────
function CameraOrbit({ radius = 4.5, speed = 0.05 }: { radius?: number; speed?: number }) {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    camera.position.x = Math.sin(t * speed) * radius;
    camera.position.z = Math.cos(t * speed) * radius;
    camera.position.y = Math.sin(t * speed * 0.6) * 0.4;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ── Inner glowing sphere ──────────────────────────────────────────────────────
function CoreSphere({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const targetColor = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 1 + amplitude * 0.32 + Math.sin(t * 2.5) * 0.02;
    meshRef.current.scale.setScalar(pulse);
    matRef.current.color.lerp(targetColor, 0.08);
    matRef.current.emissive.lerp(targetColor, 0.06);
    const g = STATE_GLOW[state];
    const target = g.core + amplitude * g.ampMul;
    matRef.current.emissiveIntensity = lerp(matRef.current.emissiveIntensity, target, 0.08);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        ref={matRef}
        color={new THREE.Color(...STATE_COLORS[state])}
        emissive={new THREE.Color(...STATE_COLORS[state])}
        emissiveIntensity={0.45}
        roughness={0.35}
        metalness={0.4}
        envMapIntensity={0}
        transparent
        opacity={0.72}
      />
    </mesh>
  );
}

// ── Inner icosahedron wireframe (energy core) ─────────────────────────────────
function InnerCore({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  const targetColor = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    meshRef.current.rotation.x = -t * 0.32;
    meshRef.current.rotation.y = t * 0.44;
    meshRef.current.scale.setScalar(1 + amplitude * 0.5);
    matRef.current.color.lerp(targetColor, 0.05);
    const g = STATE_GLOW[state];
    const target = g.inner + amplitude * g.ampMul * 0.25;
    matRef.current.opacity = lerp(matRef.current.opacity, target, 0.1);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.55, 1]} />
      <meshBasicMaterial
        ref={matRef}
        color={new THREE.Color(...STATE_COLORS[state])}
        wireframe
        transparent
        opacity={0.55}
      />
    </mesh>
  );
}

// ── Fresnel Rim Shell ─────────────────────────────────────────────────────────
const fresnelVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;
const fresnelFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), uPower);
    gl_FragColor = vec4(uColor * uIntensity * fresnel, 1.0);
  }
`;

function FresnelShell({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const targetColor = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(...STATE_COLORS[state]) },
      uIntensity: { value: 0.9 },
      uPower: { value: 2.6 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(() => {
    if (!matRef.current) return;
    const c = matRef.current.uniforms.uColor.value as THREE.Color;
    c.lerp(targetColor, 0.06);
    const g = STATE_GLOW[state];
    const target = g.fresnel + amplitude * g.ampMul * 0.85;
    matRef.current.uniforms.uIntensity.value = lerp(
      matRef.current.uniforms.uIntensity.value,
      target,
      0.1,
    );
  });

  return (
    <mesh>
      <sphereGeometry args={[1.06, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={fresnelVertexShader}
        fragmentShader={fresnelFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── Rotating ring ─────────────────────────────────────────────────────────────
function Ring({
  radius, speed, tiltX, tiltZ, state, amplitude,
}: {
  radius: number; speed: number; tiltX: number; tiltZ: number;
  state: OrbState; amplitude: number;
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
    matRef.current.emissiveIntensity = 0.55 + amplitude * 1.2;
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, 0.022, 16, 120]} />
      <meshStandardMaterial
        ref={matRef}
        color={new THREE.Color(...STATE_COLORS[state])}
        emissive={new THREE.Color(...STATE_COLORS[state])}
        emissiveIntensity={0.55}
        roughness={0.08}
        metalness={0.95}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// ── Spiral energy particle field ──────────────────────────────────────────────
function ParticleField({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const COUNT = 240;
  const posRef = useRef<THREE.BufferAttribute>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);

  const { positions, angles, radii, heights, speeds, hPhase } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const angles = new Float32Array(COUNT);
    const radii = new Float32Array(COUNT);
    const heights = new Float32Array(COUNT);
    const speeds = new Float32Array(COUNT);
    const hPhase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      angles[i] = Math.random() * Math.PI * 2;
      radii[i] = 1.6 + Math.random() * 1.4;
      heights[i] = (Math.random() - 0.5) * 2.2;
      speeds[i] = (Math.random() * 0.6 + 0.25) * (Math.random() > 0.5 ? 1 : -1);
      hPhase[i] = Math.random() * Math.PI * 2;
    }
    return { positions, angles, radii, heights, speeds, hPhase };
  }, []);

  const color = useMemo(() => new THREE.Color(...STATE_COLORS[state]), [state]);

  useFrame(({ clock }) => {
    if (!posRef.current) return;
    const t = clock.getElapsedTime();
    const arr = posRef.current.array as Float32Array;
    const angularBoost = 1 + amplitude * 2;
    for (let i = 0; i < COUNT; i++) {
      angles[i] += speeds[i] * 0.005 * angularBoost;
      const r = radii[i];
      const h = heights[i] + Math.sin(t * 0.7 + hPhase[i]) * 0.18;
      arr[i * 3] = Math.cos(angles[i]) * r;
      arr[i * 3 + 1] = h;
      arr[i * 3 + 2] = Math.sin(angles[i]) * r;
    }
    posRef.current.needsUpdate = true;
    if (matRef.current) matRef.current.color.lerp(color, 0.05);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          ref={posRef}
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color={color}
        size={0.028}
        sizeAttenuation
        transparent
        opacity={0.6}
      />
    </points>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ state, amplitude }: { state: OrbState; amplitude: number }) {
  return (
    <>
      <CameraOrbit radius={4.5} speed={0.05} />

      <ProceduralEnv />

      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 3]} intensity={0.55} color="#00e5ff" />
      <pointLight position={[0, 0, -3]} intensity={0.3} color="#00e5ff" />

      <CoreSphere state={state} amplitude={amplitude} />
      <InnerCore state={state} amplitude={amplitude} />
      <FresnelShell state={state} amplitude={amplitude} />

      <Ring radius={1.35} speed={0.6}  tiltX={0.4}  tiltZ={0}    state={state} amplitude={amplitude} />
      <Ring radius={1.55} speed={-0.4} tiltX={-0.3} tiltZ={0.5}  state={state} amplitude={amplitude} />
      <Ring radius={1.75} speed={0.25} tiltX={0.8}  tiltZ={-0.3} state={state} amplitude={amplitude} />
      <Ring radius={1.95} speed={-0.18} tiltX={0.2} tiltZ={0.7}  state={state} amplitude={amplitude} />

      <ParticleField state={state} amplitude={amplitude} />

      <EffectComposer>
        <Bloom
          intensity={1.0}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0018, 0.0018)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette
          offset={0.15}
          darkness={0.7}
          eskil={false}
        />
      </EffectComposer>
    </>
  );
}

// ── Exported component ────────────────────────────────────────────────────────
// Stable key prevents Canvas remount when parent re-renders
const CANVAS_KEY = "jarvis-reactor-canvas";

export function ReactorCore({
  state,
  amplitude,
}: {
  state: OrbState;
  amplitude: number;
}) {
  return (
    // position:fixed fills the entire viewport behind all UI elements
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        background: "#000",
      }}
    >
      <Canvas
        key={CANVAS_KEY}
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.65,
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Scene state={state} amplitude={amplitude} />
      </Canvas>
    </div>
  );
}
