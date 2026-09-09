/* ============================================================
   main.js — التشغيل الرئيسي:
   1) شاشة البداية: فطومتي ← بطتي ← مزتي ← "لفطومتي ❤️"
   2) الرسالة + الرسالة المخفية
   3) النافيجيشن السفلي (تفعيل القسم الحالي أثناء السكرول)
   4) زر الاحتفال
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};

  /* =========================================================
     1) شاشة البداية
     ========================================================= */
  function runIntro() {
    var intro = document.getElementById('intro');
    var skip = document.getElementById('introSkip');

    // لو مفيش انترو أصلاً: ابدأ فوراً
    if (!intro) {
      document.body.classList.add('ready');
      return;
    }

    // شاشة الترحيب بتظهر في كل مرة يفتح فيها الموقع،
    // وبتشتغل في كل الأحوال — الأنيميشن اجباري حتى لو
    // "تقليل الحركة" مفعّل من الموبايل (وده سايبها زر التخطي)

    var words = document.querySelectorAll('.intro-word');
    var finale = document.querySelector('.intro-final');
    var timers = [];

    function finish() {
      timers.forEach(clearTimeout);
      intro.classList.add('done');
      document.body.classList.add('ready');   // من هنا بتبدأ أنيميشن الظهور
      setTimeout(function () {
        if (intro.parentNode) intro.parentNode.removeChild(intro);
      }, 1000);
    }

    // التسلسل: كل لقب يظهر ويختفي، وبعدين "لفطومتي ❤️"
    var t = 200;
    Array.prototype.forEach.call(words, function (w) {
      timers.push(setTimeout(function () { w.classList.add('show'); }, t));
      t += 900;
    });
    timers.push(setTimeout(function () { finale.classList.add('show'); }, t + 150));
    timers.push(setTimeout(finish, t + 2500));

    skip.addEventListener('click', finish);
    intro.addEventListener('click', function (e) {
      if (e.target === intro || e.target.classList.contains('intro-stage')) finish();
    });
  }

  /* =========================================================
     2) الرسالة
     ========================================================= */
  function renderLetter() {
    var L = C.letter || {};
    var head = document.getElementById('letterHead');
    var body = document.getElementById('letterBody');
    var sign = document.getElementById('letterSign');
    if (head && L.head) head.textContent = L.head;
    if (sign && L.sign) sign.textContent = L.sign;
    if (body && L.paragraphs) {
      var html = '';
      L.paragraphs.forEach(function (p) { html += '<p>' + p + '</p>'; });
      body.innerHTML = html;
    }
  }

  /* ---------- الرسالة المخفية ---------- */
  function initSecret() {
    var S = C.secret || {};
    var card = document.getElementById('secretCard');
    var reveal = document.getElementById('secretReveal');
    if (!card || !reveal) return;

    var title = card.querySelector('.secret-title');
    var hint = card.querySelector('.secret-hint');
    if (title) title.textContent = S.closedTitle || 'في حاجة مستخبية هنا...';
    if (hint) hint.textContent = S.hint || 'دوسي';

    card.addEventListener('click', function () {
      if (card.hidden) return;
      card.classList.add('opening');
      setTimeout(function () {
        card.hidden = true;
        reveal.innerHTML =
          '<p class="sr-line1">' + (S.line1 || 'وصلتي للآخر ❤️') + '</p>' +
          '<p class="sr-line2">' + (S.line2 || '') + '</p>' +
          '<p class="sr-line3">' + (S.callback || '') + '</p>';
        reveal.hidden = false;

        // فرقعة قلوب صغيرة عند الفتح
        if (App.effects && App.effects.Confetti) {
          var r = reveal.getBoundingClientRect();
          App.effects.Confetti.burst(r.left + r.width / 2, r.top + r.height / 3, 40);
        }
      }, 380);
    });
  }

  /* =========================================================
     3) النافيجيشن السفلي
     ========================================================= */
  function initNav() {
    var items = document.querySelectorAll('.bottom-nav .nav-item');
    if (!items.length || !('IntersectionObserver' in window)) return;

    var map = {};
    Array.prototype.forEach.call(items, function (a) {
      map[a.getAttribute('data-nav')] = a;
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        Array.prototype.forEach.call(items, function (a) { a.classList.remove('active'); });
        if (map[id]) map[id].classList.add('active');
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

    ['home', 'story', 'memories', 'gallery', 'letter', 'birthday'].forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }

  /* =========================================================
     4) زر الاحتفال
     ========================================================= */
  function initCelebrate() {
    var btn = document.getElementById('celebrateBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var card = document.querySelector('.birthday-card');
      var r = card ? card.getBoundingClientRect() : {
        left: window.innerWidth / 2 - 60,
        top: window.innerHeight / 2 - 60,
        width: 120, height: 120
      };
      if (App.effects && App.effects.Confetti) {
        App.effects.Confetti.burst(r.left + r.width / 2, r.top + r.height / 3, 80);
      }
      if (App.share) App.share.toast('كل سنة وانتي طيبة يا فطومتي ❤️');
    });
  }

  /* =========================================================
     نقطة التشغيل — الترتيب مهم:
     المحتوى الأول، بعدين الحركات، بعدين شاشة البداية
     ========================================================= */
  App.ready(function () {
    // 1) المحتوى (عشان عناصر .reveal تبقى جاهزة للـ observer)
    App.story.init();
    App.gallery.init();
    renderLetter();
    initSecret();
    App.gate.init();

    // 2) الحركات
    App.effects.init();
    App.effects.initReveals();
    App.effects.initParallax();
    App.effects.initScrollCues();

    // 3) الموديولات
    App.countdown.init();
    App.share.init();
    App.settings.init();
    initNav();
    initCelebrate();

    // 4) شاشة البداية في الآخر (كل حاجة جاهزة تحتها)
    runIntro();
  });

})(window.App);

