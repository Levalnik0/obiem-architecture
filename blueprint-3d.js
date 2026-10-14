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
    camera.position.set(4.3, 2.9, 5.3);
    camera.lookAt(-0.1, 1.3, 0.2);
    renderer.setSize(size.w, size.h, false);

    const ambient = new THREE.AmbientLight(0xfff8ec, 0.75);
    const key = new THREE.DirectionalLight(0xfff2de, 0.95);
    key.position.set(3, 4, 2);
    const rim = new THREE.DirectionalLight(0xe8f0ff, 0.4);
    rim.position.set(-3, 1, -2);
    scene.add(ambient, key, rim);

    const pivot = new THREE.Group();
    pivot.rotation.y = -0.45;
    scene.add(pivot);

    // ---------- house geometry: cantilevered two-volume composition ----------
    function boxEdges(cx, cy, cz, w, h, d) {
      const x0 = cx - w / 2, x1 = cx + w / 2;
      const y0 = cy - h / 2, y1 = cy + h / 2;
      const z0 = cz - d / 2, z1 = cz + d / 2;
      const p = {
        '000': new THREE.Vector3(x0, y0, z0), '100': new THREE.Vector3(x1, y0, z0),
        '110': new THREE.Vector3(x1, y1, z0), '010': new THREE.Vector3(x0, y1, z0),
        '001': new THREE.Vector3(x0, y0, z1), '101': new THREE.Vector3(x1, y0, z1),
        '111': new THREE.Vector3(x1, y1, z1), '011': new THREE.Vector3(x0, y1, z1)
      };
      return [
        [p['000'], p['100']], [p['100'], p['101']], [p['101'], p['001']], [p['001'], p['000']],
        [p['010'], p['110']], [p['110'], p['111']], [p['111'], p['011']], [p['011'], p['010']],
        [p['000'], p['010']], [p['100'], p['110']], [p['101'], p['111']], [p['001'], p['011']]
      ];
    }
    function rectEdges(p0, p1, p2, p3) {
      return [[p0, p1], [p1, p2], [p2, p3], [p3, p0]];
    }

    // ground floor (wide, shallow)
    const A = boxEdges(0, 0.5, 0, 3.2, 1.0, 1.8);
    // cantilevered upper floor, offset and overhanging past the ground floor
    const B = boxEdges(-0.3, 1.5, 0.35, 2.6, 1.0, 2.6);
    // thin flat roof slab, overhanging the upper volume on every side
    const Roof = boxEdges(-0.3, 2.03, 0.35, 2.9, 0.06, 2.9);
    // narrow stair/service tower poking above the roofline
    const Tower = boxEdges(1.0, 2.35, -0.5, 0.6, 1.3, 0.6);

    // ribbon windows
    const w1 = rectEdges(
      new THREE.Vector3(-1.45, 0.2, 0.9), new THREE.Vector3(-1.45, 0.8, 0.9),
      new THREE.Vector3(1.45, 0.8, 0.9), new THREE.Vector3(1.45, 0.2, 0.9)
    );
    const w1mullion = [[new THREE.Vector3(0, 0.2, 0.9), new THREE.Vector3(0, 0.8, 0.9)]];
    const w2 = rectEdges(
      new THREE.Vector3(-1.5, 1.2, 1.65), new THREE.Vector3(-1.5, 1.85, 1.65),
      new THREE.Vector3(0.6, 1.85, 1.65), new THREE.Vector3(0.6, 1.2, 1.65)
    );
    const w2mullion = [[new THREE.Vector3(-0.45, 1.2, 1.65), new THREE.Vector3(-0.45, 1.85, 1.65)]];

    const segments = [...A, ...B, ...Roof, ...Tower, ...w1, ...w1mullion, ...w2, ...w2mullion];

    // ---------- rods: real cylindrical geometry instead of 1px lines ----------
    const RADIUS = 0.032;
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
        const delay = i * 0.032;
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
