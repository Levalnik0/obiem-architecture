gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

/* ---------- Preloader (number only, no bar) ---------- */
function runPreloader(done){
  const num = document.getElementById('preloaderNum');
  const pre = document.getElementById('preloader');
  const p = { v: 0 };
  gsap.to(p, {
    v: 100, duration: reduceMotion ? 0.1 : 1.2, ease: 'power2.inOut',
    onUpdate(){ num.textContent = Math.round(p.v); },
    onComplete(){
      gsap.to(pre, {
        opacity: 0, duration: 0.5, delay: 0.1,
        onComplete(){ pre.style.display = 'none'; done(); }
      });
    }
  });
}

/* ---------- Lenis ---------- */
let lenis;
function initLenis(){
  if (reduceMotion || typeof Lenis === 'undefined') return;
  lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  requestAnimationFrame(function raf(time){ lenis.raf(time); requestAnimationFrame(raf); });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Custom cursor (plain dot) ---------- */
function initCursor(){
  if (isTouch) return;
  const cursor = document.getElementById('cursor');
  let mx = 0, my = 0, cx = 0, cy = 0;
  window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
  gsap.ticker.add(() => {
    cx += (mx - cx) * 0.22;
    cy += (my - cy) * 0.22;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
  });
  document.querySelectorAll('[data-cursor-hover]').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  });
}

/* ---------- Magnetic ---------- */
function initMagnetic(){
  if (isTouch) return;
  document.querySelectorAll('.btn-magnetic').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(btn, { x: x * 0.25, y: y * 0.35, duration: 0.4, ease: 'power3.out' });
    });
    btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
  });
}

/* ---------- Header: solid background once scrolled past the hero photo
   (fixes the mix-blend-mode header becoming unreadable over body text) ---------- */
function initHeaderScroll(){
  const header = document.getElementById('header');
  const threshold = Math.min(window.innerHeight * 0.7, 480);
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate(){ header.classList.toggle('is-scrolled', window.scrollY > threshold); }
  });
}

/* ---------- Menu overlay (single trigger, all breakpoints) ---------- */
function initMenu(){
  const trigger = document.getElementById('menuTrigger');
  const overlay = document.getElementById('menuOverlay');
  function close(){
    overlay.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.querySelector('span').textContent = 'Меню';
  }
  trigger.addEventListener('click', () => {
    const open = overlay.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(open));
    trigger.querySelector('span').textContent = open ? 'Закрыть' : 'Меню';
  });
  overlay.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---------- Hero entrance ---------- */
function heroEntrance(){
  gsap.set('.hero__eyebrow span', { yPercent: 120 });
  gsap.to('.hero__eyebrow span', { yPercent: 0, duration: 0.9, ease: 'power4.out', delay: 0.1 });
  if (!reduceMotion){
    gsap.to('.hero__img', {
      yPercent: 10, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }
}

/* ---------- Scroll reveals ---------- */
function initReveals(){
  gsap.utils.toArray('.reveal-up').forEach(el => {
    gsap.fromTo(el, { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true }
    });
  });
}

/* ---------- Projects: horizontal scroll-jacked rail ---------- */
function initProjectsRail(){
  const wrap = document.querySelector('.projects__rail-wrap');
  const rail = document.getElementById('projectsRail');
  if (!wrap || !rail || isTouch || window.innerWidth < 860) return;

  function scrollLength(){ return Math.max(0, rail.scrollWidth - wrap.clientWidth); }

  ScrollTrigger.create({
    trigger: '.projects',
    start: 'top top',
    end: () => '+=' + scrollLength(),
    pin: true,
    scrub: 1,
    invalidateOnRefresh: true,
    onUpdate(self){
      rail.style.transform = `translateX(-${scrollLength() * self.progress}px)`;
    }
  });
}

/* ---------- Blueprint: 3D house that draws itself on scroll ---------- */
function initBlueprint(){
  const canvas = document.getElementById('blueprintCanvas');
  if (!canvas || typeof window.initBlueprint3D !== 'function') return;
  const scene3d = window.initBlueprint3D(canvas);
  if (!scene3d) return;
  ScrollTrigger.create({
    trigger: '.philosophy__blueprint', start: 'top 80%', end: 'bottom top',
    onEnter(){ scene3d.playDraw(); },
    onEnterBack(){ scene3d.playDraw(); }
  });
}

/* ---------- Approach accordion ---------- */
function initApproach(){
  const items = document.querySelectorAll('.approach__item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const wasActive = item.classList.contains('is-active');
      items.forEach(i => i.classList.remove('is-active'));
      if (!wasActive) item.classList.add('is-active');
    });
  });
}

/* ---------- Anchors ---------- */
function initAnchors(){
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -10 });
      else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initAnchors();
  initMenu();
  initHeaderScroll();
  initCursor();
  initMagnetic();
  initReveals();
  initProjectsRail();
  initBlueprint();
  initApproach();

  runPreloader(() => {
    initLenis();
    heroEntrance();
    ScrollTrigger.refresh();
  });
});
