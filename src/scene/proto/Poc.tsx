// PROTOTYPE ONLY (proto/visual-v2, never merged): one table dressed with the Blender POC assets.
import * as THREE from "three";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { drape } from "../items/Items";
import { TOP as TABLE_TOP } from "../items/common";

const base = `${import.meta.env.BASE_URL}poc/`;
const TABLE: [number, number] = [3.0, 2.3];
const TOP = TABLE_TOP + 0.003;

function useAsset(name: string) {
  const { scene } = useGLTF(base + name);
  return useMemo(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return scene;
  }, [scene]);
}

function Copy({
  object,
  position,
  rotY = 0,
}: {
  object: THREE.Object3D;
  position: [number, number, number];
  rotY?: number;
}) {
  const clone = useMemo(() => object.clone(true), [object]);
  return <primitive object={clone} position={position} rotation-y={rotY} />;
}

const glowTex = (() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d") as CanvasRenderingContext2D;
  const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.4, "#777");
  g.addColorStop(1, "#000");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();

export function PocTable() {
  const chair = useAsset("chair-oval.glb");
  const guest = useAsset("guest-seated-meshy.glb");
  const setting = useAsset("setting.glb");
  const lamp = useAsset("lamp.glb");
  const roses = useAsset("roses.glb");
  const candles = useAsset("candles.glb");
  const [tx, tz] = TABLE;
  const linenGeo = useMemo(() => drape("rect", 1.86, 0.96, TABLE_TOP - 0.03), []);
  const linenMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#f2eee6",
        roughness: 0.92,
        sheen: 0.35,
        sheenColor: new THREE.Color("#ffffff"),
        sheenRoughness: 0.6,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const seats = [-0.6, 0, 0.6];
  return (
    <group name="poc-table">
      <mesh geometry={linenGeo} material={linenMat} position={[tx, 0, tz]} castShadow receiveShadow />
      {seats.map((dx) => (
        <group key={`n${dx}`}>
          <Copy object={chair} position={[tx + dx, 0, tz - 0.75]} />
          <Copy object={setting} position={[tx + dx, TOP, tz - 0.3]} />
          <Copy object={chair} position={[tx + dx, 0, tz + 0.75]} rotY={Math.PI} />
          <Copy object={setting} position={[tx + dx, TOP, tz + 0.3]} rotY={Math.PI} />
        </group>
      ))}
      <primitive object={guest} position={[tx, 0, tz - 0.75]} />
      <primitive object={lamp} position={[tx + 0.05, TOP, tz]} />
      <primitive object={roses} position={[tx + 0.55, TOP, tz + 0.02]} scale={1.6} />
      <primitive object={candles} position={[tx - 0.5, TOP, tz - 0.02]} rotation-y={0.6} />
      {/* Photo mode: the lamp and the candles cast real (unshadowed) light. */}
      <pointLight
        position={[tx + 0.05, TOP + 0.26, tz]}
        intensity={1.1}
        distance={2.6}
        decay={2}
        color="#ffd2a0"
      />
      <pointLight
        position={[tx - 0.5, TOP + 0.24, tz - 0.02]}
        intensity={0.9}
        distance={2.2}
        decay={2}
        color="#ffc890"
      />
      {/* Painted warm pools on the cloth under the lamp and the candles (plan V5). */}
      {[
        [tx + 0.05, 1.3],
        [tx - 0.5, 0.8],
      ].map(([x, s]) => (
        <mesh key={x} position={[x as number, TOP + 0.004, tz]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[s as number, s as number]} />
          <meshBasicMaterial
            color="#ffb060"
            alphaMap={glowTex}
            transparent
            opacity={0.6}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Soft contact shadow of the table and chairs on the floor. */}
      <mesh position={[tx, 0.006, tz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.2, 2.6]} />
        <meshBasicMaterial color="#000" alphaMap={glowTex} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}
