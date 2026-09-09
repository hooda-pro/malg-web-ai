/* ============================================================
   effects.js — كل الحركة في الخلفية:
   1) نجوم وقلوب الخلفية
   2) أنيميشن الظهور أثناء السكرول (IntersectionObserver)
   3) Parallax خفيف للـ Hero (على الشاشات الكبيرة بس)
   4) محرك الكونفيتي (كانفاس خفيف مخصوص للموبايل)
   الأنيميشن اجباري: بيشغل في كل الأحوال حتى لو
   "تقليل الحركة" مفعّل من الموبايل
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  // الأنيميشن اجباري: الحركات شغالة في كل الأحوال حتى لو "تقليل الحركة"
  // مفعّل من الموبايل — REDUCED ثابتة false عشان كل الكود يشتغل عادي
  var REDUCED = false;
  // الموبايل: نوفّر فيه أكتر (نجوم أقل، من غير بارالاكس، خلفية أهدأ)
  var SMALL = window.matchMedia('(max-width: 899px)').matches;

  App.reducedMotion = function () { return REDUCED; };

  /* =========================================================
     1) خلفية السماء: نجوم بتلمع + قلوب طايرة
     ========================================================= */
  function buildSky() {
    var starsBox = document.getElementById('skyStars');
    var heartsBox = document.getElementById('skyHearts');
    if (!starsBox || !heartsBox) return;

    var frag = document.createDocumentFragment();
    var i, el;

    // نجوم: صغيرة ورخيصة على الـ GPU (opacity بس) — عدد أقل على الموبايل
    var STAR_COUNT = SMALL ? 14 : 26;
    for (i = 0; i < STAR_COUNT; i++) {
      el = document.createElement('span');
      el.className = 'star';
      el.style.left = (Math.random() * 100).toFixed(2) + '%';
      el.style.top = (Math.random() * 70).toFixed(2) + '%';
      el.style.setProperty('--s', (1 + Math.random() * 1.6).toFixed(2) + 'px');
      el.style.setProperty('--t', (2 + Math.random() * 3).toFixed(2) + 's');
      el.style.setProperty('--o', (0.4 + Math.random() * 0.5).toFixed(2));
      el.style.setProperty('--dl', (-Math.random() * 5).toFixed(2) + 's');
      frag.appendChild(el);
    }
    starsBox.appendChild(frag);

    // قلوب طايرة: قليلة وبتتحرك بـ transform بس
    var HEARTS = ['❤️', '💗', '🤍', '❤️', '💖'];
    frag = document.createDocumentFragment();
    var HEART_COUNT = SMALL ? 4 : 7;
    for (i = 0; i < HEART_COUNT; i++) {
      el = document.createElement('span');
      el.className = 'fheart';
      el.textContent = HEARTS[i % HEARTS.length];
      el.style.setProperty('--x', (5 + Math.random() * 90).toFixed(1) + '%');
      el.style.setProperty('--fs', (12 + Math.random() * 12).toFixed(0) + 'px');
      el.style.setProperty('--t', (16 + Math.random() * 14).toFixed(1) + 's');
      el.style.setProperty('--dl', (-Math.random() * 22).toFixed(1) + 's');
      el.style.setProperty('--o', (0.25 + Math.random() * 0.3).toFixed(2));
      frag.appendChild(el);
    }
    heartsBox.appendChild(frag);

    // وقّف الخلفية لما التاب يبقى مخفي (توفير بطارية وموارد)
    var sky = document.querySelector('.sky');
    document.addEventListener('visibilitychange', function () {
      if (sky) sky.classList.toggle('paused', document.hidden);
    });
  }

  /* =========================================================
     2) الظهور أثناء السكرول (Reveal)
     ========================================================= */
  function initReveals() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    // لو المستخدم مفضّل تقليل الحركة: ظهر كل حاجة على طول
    if (REDUCED || !('IntersectionObserver' in window)) {
      items.forEach ? items.forEach(function (n) { n.classList.add('in'); }) :
        Array.prototype.forEach.call(items, function (n) { n.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(items, function (n) { io.observe(n); });
  }

  /* =========================================================
     3) Parallax خفيف للـ Hero (بـ rAF وtransform بس)
     ========================================================= */
  function initParallax() {
    if (REDUCED || SMALL) return;   // الموبايل: من غير بارالاكس عشان السكرول يفضل ناعم
    var heroInner = document.getElementById('heroInner');
    if (!heroInner) return;

    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset;
      if (y < 900) {
        heroInner.style.transform = 'translate3d(0,' + (y * 0.18).toFixed(1) + 'px,0)';
        heroInner.style.opacity = String(Math.max(0, 1 - y / 620));
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* =========================================================
     4) محرك الكونفيتي — كانفاس خفيف مخصوص للموبايل:
        - سقف للـ DPR
        - عدد قطع محدود
        - بيقف لوحده لما مفيش قطع
        - بيتجاهل لو المستخدم مفضل تقليل الحركة
     ========================================================= */
  var Confetti = (function () {
    var canvas = document.getElementById('confetti');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var particles = [];
    var running = false;
    var gentle = false;
    var DPR = 1;
    var COLORS = ['#ff5c8a', '#ffb3c7', '#f7c873', '#ffffff', '#e0447a'];

    function resize() {
      if (!canvas) return;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }

    function makeParticle() {
      return {
        x: Math.random() * canvas.width,
        y: -20,
        vx: (Math.random() - 0.5) * 1.6 * DPR,
        vy: (0.6 + Math.random() * 1.4) * DPR,
        size: (5 + Math.random() * 6) * DPR,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.12,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        heart: Math.random() < 0.4
      };
    }

    // قلب صغير: دايرتين + مثلث
    function drawHeart(s) {
      ctx.beginPath();
      ctx.arc(-s * 0.25, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.arc(s * 0.25, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.54, 0);
      ctx.lineTo(0, s * 0.72);
      ctx.lineTo(s * 0.54, 0);
      ctx.closePath();
      ctx.fill();
    }

    function step() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var i, p;
      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.012 * DPR;   // جاذبية خفيفة
        p.rot += p.vr;

        if (p.y > canvas.height + 30) { particles.splice(i, 1); continue; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.heart) { drawHeart(p.size); }
        else { ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
        ctx.restore();
      }

      // وضع "مطر خفيف" مستمر أثناء الاحتفال (عدد محدود)
      if (gentle && particles.length < 64 && Math.random() < 0.7) {
        particles.push(makeParticle());
      }

      if (particles.length === 0 && !gentle) {
        running = false;
        canvas.classList.remove('on');
        return;
      }
      window.requestAnimationFrame(step);
    }

    function ensureRunning() {
      if (!ctx || running) return;
      running = true;
      canvas.classList.add('on');
      window.requestAnimationFrame(step);
    }

    return {
      burst: function (cx, cy, count) {
        if (!ctx || REDUCED) return;
        resize();
        ensureRunning();
        var n = Math.min(count || 60, 90);
        for (var i = 0; i < n; i++) {
          var p = makeParticle();
          var angle = Math.random() * Math.PI * 2;
          var speed = (2 + Math.random() * 4) * DPR;
          p.x = cx * DPR;
          p.y = cy * DPR;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed - 2 * DPR;
          particles.push(p);
        }
      },
      setGentle: function (on) {
        if (!ctx || REDUCED) return;
        gentle = on;
        if (on) { resize(); ensureRunning(); }
      },
      resize: resize
    };
  })();

  window.addEventListener('resize', function () { Confetti.resize(); }, { passive: true });

  /* شريط تقدم القراءة فوق + خط الزمن بيتملّي مع السكرول */
  function initScrollCues() {
    var bar = document.getElementById('scrollProgressBar');
    var tl = document.getElementById('timeline');
    var tlLine = tl ? tl.querySelector('.tl-progress') : null;
    var wideQ = window.matchMedia('(min-width:860px)');
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;

      if (bar) {
        var doc = document.documentElement;
        var max = (doc.scrollHeight - window.innerHeight) || 1;
        var p = Math.min(1, Math.max(0, y / max));
        bar.style.width = (p * 100).toFixed(2) + '%';
      }

      if (tlLine) {
        var r = tl.getBoundingClientRect();
        var vh = window.innerHeight || 1;
        var passed = Math.min(Math.max(vh * 0.75 - r.top, 0), r.height);
        var sc = r.height ? (passed / r.height) : 0;
        tlLine.style.transform = (wideQ.matches ? 'translateX(50%) ' : '') + 'scaleY(' + sc.toFixed(3) + ')';
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });

    update();
  }

  /* =========================================================
     نقطة تشغيل الحركات — بيتنادى من js/main.js
     ========================================================= */
  App.effects = {
    init: function () {
      buildSky();   // الخلفية بتشتغل دايمًا — الأنيميشن اجباري
    },
    initReveals: initReveals,
    initParallax: initParallax,
    initScrollCues: initScrollCues,
    Confetti: Confetti
  };

  App.ready = function (fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  };

})(window.App);

