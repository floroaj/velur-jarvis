/**
 * FlowerCore — High-detail 3D orb inspired by the reference image:
 * - Inner sphere with Flower-of-Life hexagonal grid pattern
 * - Organic outer shell (icosphere with displacement + noise)
 * - Teal glow bloom post-processing
 * - Audio-reactive amplitude drives scale and emissive intensity
 * - State-based color transitions
 */
import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface FlowerCoreProps {
  state: OrbState;
  amplitude?: number; // 0–1 from audio analyser
  size?: number;      // canvas size in px
}

// ── State colour map ──────────────────────────────────────────────────────────
const STATE_COLORS: Record<OrbState, { inner: string; outer: string; bloom: number }> = {
  idle:      { inner: "#00e5cc", outer: "#00b8a0", bloom: 0.6 },
  listening: { inner: "#00ff99", outer: "#00cc77", bloom: 1.2 },
  thinking:  { inner: "#e0a020", outer: "#c07800", bloom: 0.9 },
  speaking:  { inner: "#40ffff", outer: "#00dddd", bloom: 1.5 },
};

// ── Flower-of-Life inner sphere ───────────────────────────────────────────────
function FlowerSphere({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.ShaderMaterial>(null);
  const targetScale = useRef(1);

  const colors = STATE_COLORS[state];

  const shader = useMemo(() => ({
    uniforms: {
      uTime:      { value: 0 },
      uAmplitude: { value: 0 },
      uColor:     { value: new THREE.Color(colors.inner) },
      uColorOuter:{ value: new THREE.Color(colors.outer) },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uAmplitude;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // Simple noise
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975, 397.2973, 491.1871));
        p += dot(p.zxy, p.yxz + 19.19);
        return fract(p.x * p.y * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
              mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
              mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }

      void main() {
        vNormal   = normal;
        vPosition = position;
        vUv       = uv;

        // Subtle vertex displacement driven by amplitude
        float n = noise(normal * 3.0 + uTime * 0.3);
        vec3 displaced = position + normal * (n * 0.04 + uAmplitude * 0.08);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uAmplitude;
      uniform vec3  uColor;
      uniform vec3  uColorOuter;
      varying vec3  vNormal;
      varying vec3  vPosition;
      varying vec2  vUv;

      // Rotate 2D
      vec2 rot2(vec2 p, float a) {
        float c = cos(a), s = sin(a);
        return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
      }

      // Hexagonal grid distance
      float hexDist(vec2 p) {
        p = abs(p);
        float c = dot(p, normalize(vec2(1.0, 1.732)));
        return max(c, p.x);
      }
      vec4 hexCoords(vec2 uv) {
        vec2 r = vec2(1.0, 1.732);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 gv = dot(a,a) < dot(b,b) ? a : b;
        float x = atan(gv.x, gv.y);
        float y = 0.5 - hexDist(gv);
        vec2 id = uv - gv;
        return vec4(x, y, id.x, id.y);
      }

      // Flower of Life: 7 overlapping circles on hex grid
      float flowerOfLife(vec2 uv) {
        float scale = 8.0;
        uv *= scale;
        vec4 hc = hexCoords(uv);
        // Draw circle at each hex center + 6 neighbours
        float r = 0.45;
        float d = 1.0;
        vec2 center = uv - hc.zw;
        // Petal circles
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 3.14159 / 3.0;
          vec2 offset = vec2(cos(a), sin(a));
          d = min(d, length(uv - (hc.zw + offset)) - r);
        }
        d = min(d, length(center) - r);
        // Line width
        return smoothstep(0.04, 0.0, abs(d));
      }

      void main() {
        // Spherical UV from normal
        vec2 uv = vec2(
          atan(vNormal.z, vNormal.x) / (2.0 * 3.14159) + 0.5,
          acos(vNormal.y) / 3.14159
        );

        // Slow rotation of the pattern
        uv.x += uTime * 0.015;

        float pattern = flowerOfLife(uv);

        // Fresnel rim
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - dot(vNormal, viewDir), 2.5);

        // Base colour mix
        vec3 col = mix(uColorOuter * 0.5, uColor, pattern);
        col += uColor * fresnel * 0.6;
        col += uColor * uAmplitude * 0.4;

        // Emissive boost on pattern lines
        float emission = pattern * (1.2 + uAmplitude * 1.5);

        gl_FragColor = vec4(col * (0.8 + emission * 0.5), 0.92);
      }
    `,
    transparent: true,
  }), []); // eslint-disable-line

  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.uColor.value.set(colors.inner);
      matRef.current.uniforms.uColorOuter.value.set(colors.outer);
    }
  }, [state, colors]);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
      matRef.current.uniforms.uAmplitude.value +=
        (amplitude - matRef.current.uniforms.uAmplitude.value) * 0.1;
    }
    if (meshRef.current) {
      targetScale.current = 1 + amplitude * 0.12;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale.current, targetScale.current, targetScale.current),
        0.08,
      );
      meshRef.current.rotation.y += 0.003;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.0, 64]} />
      <shaderMaterial ref={matRef} args={[shader]} side={THREE.FrontSide} />
    </mesh>
  );
}

// ── Organic outer shell ───────────────────────────────────────────────────────
function OuterShell({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.ShaderMaterial>(null);

  const colors = STATE_COLORS[state];

  const shader = useMemo(() => ({
    uniforms: {
      uTime:      { value: 0 },
      uAmplitude: { value: 0 },
      uColor:     { value: new THREE.Color(colors.outer) },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uAmplitude;
      varying vec3 vNormal;
      varying vec3 vPosition;

      // Smooth noise
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975, 397.2973, 491.1871));
        p += dot(p.zxy, p.yxz + 19.19);
        return fract(p.x * p.y * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main() {
        vNormal   = normal;
        vPosition = position;
        // Organic displacement
        float n = fbm(normal * 2.5 + uTime * 0.12);
        float disp = 0.18 + n * 0.22 + uAmplitude * 0.15;
        vec3 displaced = position * (1.0 + disp);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uAmplitude;
      uniform vec3  uColor;
      varying vec3  vNormal;
      varying vec3  vPosition;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
        // Only render the rim — transparent centre
        float alpha = fresnel * (0.35 + uAmplitude * 0.25);
        vec3 col = uColor * (0.6 + fresnel * 0.8 + uAmplitude * 0.4);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  }), []); // eslint-disable-line

  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.uColor.value.set(colors.outer);
    }
  }, [state, colors]);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
      matRef.current.uniforms.uAmplitude.value +=
        (amplitude - matRef.current.uniforms.uAmplitude.value) * 0.08;
    }
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.001;
      meshRef.current.rotation.y -= 0.002;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.55, 32]} />
      <shaderMaterial ref={matRef} args={[shader]} />
    </mesh>
  );
}

// ── Rotating ring ─────────────────────────────────────────────────────────────
function Ring({ radius, tilt, speed, color }: { radius: number; tilt: number; speed: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.z += speed;
  });
  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.006, 8, 128]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  );
}

// ── Particle field ────────────────────────────────────────────────────────────
function Particles({ count = 300, color }: { count?: number; color: string }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.8 + Math.random() * 0.8;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.04;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.018} color={color} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ state, amplitude }: { state: OrbState; amplitude: number }) {
  const colors = STATE_COLORS[state];

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, 3]} intensity={2} color={colors.inner} />

      <FlowerSphere state={state} amplitude={amplitude} />
      <OuterShell   state={state} amplitude={amplitude} />

      {/* Rotating rings at various tilts */}
      <Ring radius={1.35} tilt={0}           speed={0.004}  color={colors.inner} />
      <Ring radius={1.45} tilt={Math.PI / 4} speed={-0.003} color={colors.outer} />
      <Ring radius={1.28} tilt={Math.PI / 6} speed={0.005}  color={colors.inner} />

      <Particles count={280} color={colors.inner} />

      <EffectComposer>
        <Bloom
          intensity={colors.bloom}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.6}
          mipmapBlur
        />

      </EffectComposer>
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function FlowerCore({ state, amplitude = 0, size = 420 }: FlowerCoreProps) {
  return (
    <div
      style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1 / 1" }}
      className="relative"
    >
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene state={state} amplitude={amplitude} />
      </Canvas>
    </div>
  );
}
