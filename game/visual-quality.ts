import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Engine } from "./engine";

/**
 * Browser-friendly visual polish layer.
 *
 * This intentionally stays outside the gameplay loop: it improves color,
 * reflections, texture sampling, shadow precision and grounding without
 * changing movement, order logic, collisions or the public Engine API.
 */
export function applyVisualQuality(engine: Engine) {
  const { renderer, scene, world, rig } = engine;
  const mobile = engine.isMobile;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mobile ? 1.05 : 1.10;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // A tiny neutral environment gives clearcoat, helmets, glass and painted
  // vehicles believable highlights without shipping a large HDR file.
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
      material.envMapIntensity = object.name === "wheel" ? 0.35 : 0.62;
      const maps = [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
      ];
      for (const texture of maps) {
        if (!texture) continue;
        texture.anisotropy = maxAnisotropy;
        texture.needsUpdate = true;
      }
    }
  });

  // The original world used a very large shadow camera. Tightening it around
  // the player greatly increases effective shadow resolution near the rider.
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

  // Track the rider so the high-resolution shadow area follows gameplay.
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0.7, 0);
  rig.group.add(sunTarget);
  sun.target = sunTarget;

  // Soft baked-style contact shadow: cheap, stable and particularly valuable
  // on web where full SSAO would add another expensive post-processing pass.
  const shadowTexture = makeContactShadowTexture();
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    color: 0x000000,
    transparent: true,
    opacity: mobile ? 0.20 : 0.24,
    depthWrite: false,
    toneMapped: false,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 3.65), contactMaterial);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, 0.018, -0.02);
  contact.renderOrder = 2;
  rig.group.add(contact);

  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.density = mobile ? 0.0072 : 0.0062;
  }

  return () => {
    rig.group.remove(contact);
    contact.geometry.dispose();
    contactMaterial.dispose();
    shadowTexture.dispose();
    envRT.dispose();
    scene.environment = null;
  };
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
