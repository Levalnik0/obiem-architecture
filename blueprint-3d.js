/*
 * ОБЪЁМ — 3D-чертёж дома (Three.js r160, ES-модуль, настоящая модель здания).
 * Грузим реальную CC-BY модель ("Modern House" — henry ham, poly.pizza),
 * превращаем каждый её фрагмент в тонкие рёбра (EdgesGeometry/LineSegments)
 * и собираем их на сцене по очереди — часть поднимается снизу, часть
 * опускается сверху, с нахлёстом по времени, плюс авто-вращение и
 * перетягивание мышью для осмотра со всех сторон.
 *
 * Подключать как <script type="module"> ПОСЛЕ import map (three + three/addons)
 * и, по возможности, после gsap.min.js (без него — запасной rAF-твин), ПЕРЕД script.js.
 *
 * API: window.initBlueprint3D(canvasEl) -> { playDraw(), destroy() } | null
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.initBlueprint3D = function initBlueprint3D(canvasEl) {
  if (!canvasEl) return null;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  } catch (err) {
    return null;
  }
  renderer.setPixelRatio(lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();

  function getSize() {
    const w = canvasEl.clientWidth || 1;
    const h = canvasEl.clientHeight || 1;
    return { w, h };
  }
  let size = getSize();
  const camera = new THREE.PerspectiveCamera(26, size.w / size.h, 0.1, 50);
  camera.position.set(4.25, 1.65, 5.2);
  camera.lookAt(-0.1, 0, 0.2);
  renderer.setSize(size.w, size.h, false);

  const pivot = new THREE.Group();
  pivot.rotation.y = -0.45;
  scene.add(pivot);

  const INK = 0xeeece6;
  const LINE_OPACITY = 0.55;
  const PANEL_BG = 0x15140d; // matches .philosophy__blueprint background-color
  const ZERO = new THREE.Vector3(0, 0, 0);
  const TARGET_DIAG = 4.6; // matches the framing tuned for this camera

  let parts = [];
  let ready = false;
  let pendingPlay = false;

  const loader = new GLTFLoader();
  loader.load(
    'assets/models/house.glb',
    (gltf) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);

      const meshes = [];
      root.traverse((obj) => { if (obj.isMesh) meshes.push(obj); });
      if (!meshes.length) return;

      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const diag = box.getSize(new THREE.Vector3()).length() || 1;
      const scale = TARGET_DIAG / diag;

      const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
      const toScale = new THREE.Matrix4().makeScale(scale, scale, scale);

      parts = meshes.map((mesh) => {
        const worldMatrix = new THREE.Matrix4().copy(toScale).multiply(toOrigin).multiply(mesh.matrixWorld);

        // hidden-line removal: an occluder mesh painted the panel's own
        // background color blocks far/interior edges so only the visible
        // silhouette reads — without it a model this detailed is just a
        // tangle of every edge seen through every other one.
        const occluderMat = new THREE.MeshBasicMaterial({
          color: PANEL_BG, transparent: true, opacity: 0, depthWrite: true,
          polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
        });
        const occluder = new THREE.Mesh(mesh.geometry, occluderMat);
        occluder.matrixAutoUpdate = false;
        occluder.matrix.copy(worldMatrix);
        occluder.updateMatrixWorld(true);

        const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 45);
        const mat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: LINE_OPACITY });
        const line = new THREE.LineSegments(edgesGeo, mat);
        line.matrixAutoUpdate = false;
        line.matrix.copy(worldMatrix);
        line.updateMatrixWorld(true);

        const group = new THREE.Group();
        group.add(occluder);
        group.add(line);
        pivot.add(group);

        const partBox = new THREE.Box3().setFromObject(line);
        const partCenter = partBox.getCenter(new THREE.Vector3());
        return { line, occluder, group, minY: partBox.min.y, centerY: partCenter.y };
      });

      // bottom-up build order: low parts (base, columns) rise from below,
      // upper parts (roof, upper volume) drop from above.
      parts.sort((a, b) => a.minY - b.minY);
      const midY = (parts[0].minY + parts[parts.length - 1].minY) / 2;
      parts.forEach((part, i) => {
        const fromBelow = part.centerY <= midY;
        part.from = new THREE.Vector3(0, fromBelow ? -3 : 3, 0);
        part.delay = i * 0.16;
        part.dur = fromBelow ? 0.75 : 0.9;
        part.ease = fromBelow ? 'power3.out' : 'back.out(1.35)';
      });

      resetToStart();
      ready = true;
      if (pendingPlay) { pendingPlay = false; playDraw(); }
    },
    undefined,
    () => { /* model failed to load — canvas stays empty, no crash */ }
  );

  function resetToStart() {
    parts.forEach((part) => {
      part.group.position.copy(part.from);
      part.line.material.opacity = 0;
      part.occluder.material.opacity = 0;
    });
  }

  let drawTweens = [];
  function runTween(obj, delay, dur, ease, update) {
    if (window.gsap) {
      drawTweens.push(window.gsap.to(obj, { t: 1, duration: dur, delay, ease, onUpdate: update }));
      return;
    }
    const startTime = performance.now() + delay * 1000;
    let raf;
    function step(now) {
      obj.t = Math.max(0, Math.min(1, (now - startTime) / (dur * 1000)));
      update();
      if (obj.t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    drawTweens.push({ kill() { cancelAnimationFrame(raf); } });
  }

  function playDraw() {
    if (!ready) { pendingPlay = true; return; }
    drawTweens.forEach((t) => t.kill && t.kill());
    drawTweens = [];
    resetToStart();
    parts.forEach((part) => {
      const obj = { t: 0 };
      const update = () => {
        part.group.position.lerpVectors(part.from, ZERO, obj.t);
        part.line.material.opacity = Math.min(LINE_OPACITY, obj.t * LINE_OPACITY * 1.6);
        part.occluder.material.opacity = Math.min(1, obj.t * 1.6);
      };
      runTween(obj, part.delay, part.dur, part.ease, update);
    });
  }

  // ---------- drag-to-rotate (+ inertia) ----------
  let isDragging = false, lastX = 0, velY = 0;
  const DRAG_SENSITIVITY = 0.01, INERTIA_DAMPING = 0.94, EPS = 0.0002;
  function onPointerDown(e) { isDragging = true; lastX = e.clientX; velY = 0; }
  function onPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    velY = dx * DRAG_SENSITIVITY;
    pivot.rotation.y += velY;
  }
  function endDrag() { isDragging = false; }
  canvasEl.style.touchAction = 'none';
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
  canvasEl.addEventListener('pointerleave', endDrag);

  function onResize() {
    size = getSize();
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0.05 }).observe(canvasEl);
  }

  const AUTO_SPEED = 0.1;
  const clock = new THREE.Clock();
  let rafId = null;
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!visible) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    if (isDragging) {
      // applied directly in onPointerMove
    } else if (Math.abs(velY) > EPS) {
      pivot.rotation.y += velY;
      velY *= INERTIA_DAMPING;
    } else if (!reduceMotion) {
      pivot.rotation.y += AUTO_SPEED * delta;
    }
    renderer.render(scene, camera);
  }
  animate();

  function destroy() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', endDrag);
    canvasEl.removeEventListener('pointercancel', endDrag);
    canvasEl.removeEventListener('pointerleave', endDrag);
    drawTweens.forEach((t) => t.kill && t.kill());
    parts.forEach(({ line, occluder }) => {
      line.geometry.dispose(); line.material.dispose();
      occluder.geometry.dispose(); occluder.material.dispose();
    });
    renderer.dispose();
  }

  return { playDraw, destroy };
};
