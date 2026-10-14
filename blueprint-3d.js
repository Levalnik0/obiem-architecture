/*
 * ОБЪЁМ — 3D-чертёж дома (Three.js r160, обычный <script>, глобальный THREE).
 * Каждое ребро — не плоская линия, а тонкая "рейка" (вытянутый цилиндр с
 * лёгким освещением), которая "отстраивается" от начальной точки к конечной,
 * плюс лёгкое авто-вращение и перетягивание мышью для осмотра со всех сторон.
 *
 * Подключать ПОСЛЕ three.min.js (и, по возможности, после gsap.min.js —
 * без него используется запасной rAF-твин) и ПЕРЕД script.js.
 *
 * API: window.initBlueprint3D(canvasEl) -> { playDraw(), destroy() } | null
 */
(function () {
  'use strict';

  window.initBlueprint3D = function initBlueprint3D(canvasEl) {
    if (!canvasEl || typeof THREE === 'undefined') return null;

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
    const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 0.1, 50);
    camera.position.set(2.9, 1.9, 3.9);
    camera.lookAt(0, 0.55, 0);
    renderer.setSize(size.w, size.h, false);

    const ambient = new THREE.AmbientLight(0xfff8ec, 0.75);
    const key = new THREE.DirectionalLight(0xfff2de, 0.95);
    key.position.set(3, 4, 2);
    const rim = new THREE.DirectionalLight(0xe8f0ff, 0.4);
    rim.position.set(-3, 1, -2);
    scene.add(ambient, key, rim);

    const pivot = new THREE.Group();
    pivot.rotation.y = -0.55;
    scene.add(pivot);

    // ---------- house geometry (simple gable box) ----------
    const hw = 1.5, hd = 1.0, wallH = 1.0, roofH = 0.85;
    const A = new THREE.Vector3(-hw, 0, -hd), B = new THREE.Vector3(hw, 0, -hd);
    const C = new THREE.Vector3(hw, 0, hd), D = new THREE.Vector3(-hw, 0, hd);
    const A2 = new THREE.Vector3(-hw, wallH, -hd), B2 = new THREE.Vector3(hw, wallH, -hd);
    const C2 = new THREE.Vector3(hw, wallH, hd), D2 = new THREE.Vector3(-hw, wallH, hd);
    const R1 = new THREE.Vector3(0, wallH + roofH, -hd), R2 = new THREE.Vector3(0, wallH + roofH, hd);

    function door(cx, w, h) {
      const x0 = cx - w / 2, x1 = cx + w / 2;
      const y0 = 0, y1 = h, z = -hd;
      const p0 = new THREE.Vector3(x0, y0, z), p1 = new THREE.Vector3(x0, y1, z);
      const p2 = new THREE.Vector3(x1, y1, z), p3 = new THREE.Vector3(x1, y0, z);
      return [[p0, p1], [p1, p2], [p2, p3], [p3, p0]];
    }

    const segments = [
      // base
      [A, B], [B, C], [C, D], [D, A],
      // walls
      [A, A2], [B, B2], [C, C2], [D, D2],
      // eaves
      [A2, B2], [B2, C2], [C2, D2], [D2, A2],
      // ridge
      [R1, R2],
      // roof slopes
      [A2, R1], [B2, R1], [C2, R2], [D2, R2],
      // door / window cutouts on the front face
      ...door(-0.55, 0.5, 0.62),
      ...door(0.6, 0.62, 0.78)
    ];

    // ---------- rods: real cylindrical geometry instead of 1px lines ----------
    const RADIUS = 0.028;
    const rodGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 8, 1);
    const INK = 0x27241a;
    const UP = new THREE.Vector3(0, 1, 0);

    function placeRod(mesh, start, end) {
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      mesh.visible = len > 0.0005;
      if (!mesh.visible) return;
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    }

    const rodObjects = segments.map(([start, end]) => {
      const mat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.55, metalness: 0.08 });
      const mesh = new THREE.Mesh(rodGeo, mat);
      placeRod(mesh, start, start);
      pivot.add(mesh);
      return { mesh, start, end };
    });

    // ---------- draw-on animation (grows each rod from start to end) ----------
    let drawTweens = [];
    function playDraw() {
      drawTweens.forEach((t) => t.kill && t.kill());
      drawTweens = [];
      rodObjects.forEach(({ mesh, start, end }, i) => {
        const obj = { t: 0 };
        const delay = i * 0.045;
        const update = () => {
          const cur = start.clone().lerp(end, obj.t);
          placeRod(mesh, start, cur);
        };
        if (window.gsap) {
          drawTweens.push(window.gsap.to(obj, { t: 1, duration: 0.5, delay, ease: 'power2.inOut', onUpdate: update }));
        } else {
          const startTime = performance.now() + delay * 1000;
          const duration = 500;
          let raf;
          function step(now) {
            obj.t = Math.max(0, Math.min(1, (now - startTime) / duration));
            update();
            if (obj.t < 1) raf = requestAnimationFrame(step);
          }
          raf = requestAnimationFrame(step);
          drawTweens.push({ kill() { cancelAnimationFrame(raf); } });
        }
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
      rodObjects.forEach(({ mesh }) => { mesh.material.dispose(); });
      rodGeo.dispose();
      renderer.dispose();
    }

    return { playDraw, destroy };
  };
})();
