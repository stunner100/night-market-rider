import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Engine } from "./engine";

/**
 * Browser-friendly visual polish layer.
 *
 * Improves color, reflections, texture sampling, shadow precision and object
 * grounding without changing gameplay, collisions or the public Engine API.
 */
export function applyVisualQuality(engine: Engine) {
  const { renderer, scene, world, rig } = engine;
  const mobile = engine.isMobile;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mobile ? 1.06 : 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Neutral PMREM reflections make clearcoat, glass, helmets and painted cars
  // react to light without shipping a large HDR environment.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  room.dispose();
  pmrem.dispose();

  const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), mobile ? 4 : 8);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) continue;

      const heroMaterial = object.name === "wheel" || object.name === "wheel-rim";
      material.envMapIntensity = heroMaterial ? 0.22 : 0.34;

      const maps = [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap];
      for (const texture of maps) {
        if (!texture) continue;
        texture.anisotropy = maxAnisotropy;
        if (texture === material.map) texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      }
    }
  });

  // Tight high-resolution shadow camera centred on gameplay rather than the
  // whole map. This gives much cleaner rider/vehicle/building shadows.
  const sun = world.sun;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const extent = mobile ? 44 : 54;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 210;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.018;
  sun.shadow.camera.updateProjectionMatrix();

  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0.7, 0);
  rig.group.add(sunTarget);
  sun.target = sunTarget;

  const shadowTexture = makeContactShadowTexture();
  const grounding: THREE.Mesh[] = [];

  // Hero rider contact shadow.
  const riderShadow = createGroundShadow(shadowTexture, 2.15, 3.65, mobile ? 0.18 : 0.23);
  riderShadow.position.set(0, 0.018, -0.02);
  rig.group.add(riderShadow);
  grounding.push(riderShadow);

  // Cheap fake AO/contact shadows for moving traffic. These improve perceived
  // quality much more than another expensive full-screen post process on web.
  for (const car of world.traffic) {
    const kind = car.kind;
    const size = kind === "bus" ? [2.55, 7.4] : kind === "trotro" ? [2.45, 5.25] : [2.05, 4.35];
    const s = createGroundShadow(shadowTexture, size[0], size[1], mobile ? 0.10 : 0.14);
    s.position.y = 0.014;
    car.mesh.add(s);
    grounding.push(s);
  }

  // Pedestrians get a very small grounding ellipse so feet stop appearing to
  // hover, especially in the softer afternoon lighting.
  if (!mobile) {
    for (const ped of world.peds) {
      if (ped.goat) continue;
      const s = createGroundShadow(shadowTexture, 0.72, 0.46, 0.10);
      s.position.y = 0.01;
      ped.mesh.add(s);
      grounding.push(s);
    }
  }

  if (scene.fog instanceof THREE.FogExp2) scene.fog.density = mobile ? 0.0092 : 0.008;

  // Keep the night readable without lifting it back to daylight.
  const originalApplySky = engine.applySky.bind(engine);
  engine.applySky = (night: number) => {
    originalApplySky(night);
    renderer.toneMappingExposure = (mobile ? 0.94 : 1.0) + night * 0.05;
    if (scene.fog instanceof THREE.FogExp2) {
      const duskFog = mobile ? 0.0092 : 0.008;
      scene.fog.density = duskFog + night * 0.0015;
    }
  };

  return () => {
    engine.applySky = originalApplySky;
    rig.group.remove(sunTarget);

    for (const mesh of grounding) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    shadowTexture.dispose();
    envRT.dispose();
    scene.environment = null;
  };
}

function createGroundShadow(texture: THREE.Texture, width: number, depth: number, opacity: number) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

function makeContactShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 7, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,0.82)");
  gradient.addColorStop(0.28, "rgba(0,0,0,0.58)");
  gradient.addColorStop(0.62, "rgba(0,0,0,0.20)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
