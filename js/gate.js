/* ============================================================
   gate.js — بوابات الموقع (بوب أب):
   1) بوابة الذكريات: سؤال تاريخ الميلاد
      → بتفتح رسايل "كلام لسه فاكره"
   2) بوابة الألبوم: سؤال "اي اكتر كلمتين بحب اسمعها منك؟"
      ولازم الإجابة فيها "قلبها" و "قلب مزتك" → بتفتح الألبوم
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};
  var G = C.gate || {};

  function $(id) { return document.getElementById(id); }

  /* ---------- تنظيف النص: نسيب الحروف والمسافات بس ---------- */
  function normalizeText(s) {
    return String(s || '')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- تحويل نص التاريخ لأي صيغة معقولة ---------- */
  function parseDate(str) {
    var s = String(str || '')
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[\s\-\.\\]/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
    var p = s.split('/').map(Number);
    if (p.length !== 3 || p.some(isNaN)) { return null; }
    if (p[0] > 31) { return { y: p[0], m: p[1], d: p[2] }; }   // سنة/شهر/يوم
    if (p[2] > 31) { return { y: p[2], m: p[1], d: p[0] }; }   // يوم/شهر/سنة
    return null;
  }

  /* ---------- فرقعة قلوب في مكان معين ---------- */
  function burstAt(el) {
    if (!el || !App.effects || !App.effects.Confetti) { return; }
    var r = el.getBoundingClientRect();
    App.effects.Confetti.burst(r.left + r.width / 2, r.top + Math.max(140, r.height / 3), 50);
  }

  function bindClose(modal, attr, closeFn) {
    Array.prototype.forEach.call(modal.querySelectorAll('[' + attr + ']'), function (el) {
      el.addEventListener('click', closeFn);
    });
  }

  /* =========================================================
     1) بوابة الذكريات: سؤال تاريخ الميلاد
     ========================================================= */
  var MemGate = (function () {
    var modal = null;
    var steps = {};
    var unlocked = false;

    function show(name) {
      Object.keys(steps).forEach(function (k) {
        steps[k].hidden = (k !== name);
      });
    }

    function open() {
      if (!modal || unlocked) { return; }
      var A = (G.memories && G.memories.ask) || {};
      $('memModalTitle').textContent = A.title || 'فاكرة تاريخ ميلادي؟ 😏';
      show('ask');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('locked');
      var input = $('memAnswer');
      if (input) { setTimeout(function () { input.focus(); }, 550); }
    }

    function close() {
      if (!modal) { return; }
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('locked');
    }

    /* فتح الرسايل: شيل القفل ودخّل الفقاعات واحدة ورا التانية */
    function unlock() {
      if (unlocked) { return; }
      unlocked = true;
      close();

      var chat = $('chat');
      var lockNote = $('chatLock');
      if (chat) {
        chat.classList.remove('locked');
        var bubbles = chat.querySelectorAll('.bubble');
        Array.prototype.forEach.call(bubbles, function (b, i) {
          b.classList.remove('in');
          b.style.transitionDelay = (i * 0.09).toFixed(2) + 's';
        });
        void chat.offsetWidth;   // reflow عشان الحركة تشتغل من الأول
        Array.prototype.forEach.call(bubbles, function (b) { b.classList.add('in'); });
      }
      if (lockNote) { lockNote.hidden = true; }

      if (App.share) { App.share.toast('اتفتحت الذكريات 🤍'); }

      // نقلها لواجهة الذكريات
      setTimeout(function () {
        var mem = document.getElementById('memories');
        if (mem) { mem.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, 350);
    }

    function init() {
      modal = document.getElementById('memoriesModal');
      if (!modal) { return; }

      Array.prototype.forEach.call(modal.querySelectorAll('[data-mem-step]'), function (el) {
        steps[el.getAttribute('data-mem-step')] = el;
      });

      var M = G.memories || {};
      var A = M.ask || {};
      var input = $('memAnswer');

      // نص القفل وإظهاره + قفل الرسايل
      var lockNote = $('chatLock');
      var chat = $('chat');
      if (lockNote) {
        lockNote.textContent = M.lock || '🔒 في حاجة مقفولة هنا... دوسي عشان تفتحيها 😏';
        lockNote.hidden = false;
        lockNote.addEventListener('click', open);
      }
      if (chat) {
        chat.classList.add('locked');
        chat.addEventListener('click', function () {
          if (chat.classList.contains('locked')) { open(); }
        });
      }

      // نصوص من content.js
      $('memAskText').textContent = A.text || '';
      if (input) { input.placeholder = A.placeholder || 'اكتبي التاريخ هنا...'; }
      $('memCheck').textContent = A.btn || 'شوكي 😄';
      $('memSkip').textContent = A.skip || 'مش فاكرة 🙈';
      $('memRevText').textContent = A.showText || 'تاريخ ميلادي هو ده 👇';
      $('memRevDate').textContent = M.dateText || '2010/1/27';
      $('memContinue').textContent = A.continueBtn || 'يلا بينا 🤍';

      bindClose(modal, 'data-close-mem-gate', close);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) { close(); }
      });

      function revealed(title) {
        var T = $('memModalTitle');
        if (T) { T.textContent = title; }
        show('revealed');
      }

      function check() {
        var v = parseDate(input.value);
        var t = M.myBirthday || [2010, 1, 27];
        if (v && v.y === t[0] && v.m === t[1] && v.d === t[2]) {
          burstAt(modal.querySelector('.modal-panel'));
          unlock();
        } else {
          revealed(A.wrongTitle || 'للأسف غلط... بس معلش 😅');
        }
      }
      $('memCheck').addEventListener('click', check);
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { check(); }
        });
      }
      $('memSkip').addEventListener('click', function () {
        revealed(A.skipTitle || 'ولا يهمك 😄');
      });
      $('memContinue').addEventListener('click', unlock);
    }

    return { init: init };
  })();

  /* =========================================================
     2) بوابة الألبوم: سؤال الكلمتين
     ========================================================= */
  var AlbumGate = (function () {
    var modal = null;
    var steps = {};
    var unlocked = false;
    var attempts = 0;

    function show(name) {
      Object.keys(steps).forEach(function (k) {
        steps[k].hidden = (k !== name);
      });
    }

    function open() {
      if (!modal || unlocked) { return; }
      var A = (G.album && G.album.ask) || {};
      attempts = 0;
      var noteEl = $('albWrongNote');
      if (noteEl) { noteEl.hidden = true; }
      $('albModalTitle').textContent = A.title || 'اي اكتر كلمتين بحب اسمعها منك؟ 😏';
      show('ask');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('locked');
      var input = $('albAnswer');
      if (input) { setTimeout(function () { input.focus(); }, 550); }
    }

    function close() {
      if (!modal) { return; }
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('locked');
    }

    /* زر "افتحي الألبوم": البوابة الأول وبعدين الألبوم بأنيميشن */
    function request() {
      if (unlocked) {
        if (App.gallery && App.gallery.openAlbum) { App.gallery.openAlbum(); }
      } else {
        open();
      }
    }

    /* ---------- رسم صور صغيرة جوه البوب أب ---------- */
    function renderPhotos() {
      var box = $('albPhotos');
      if (!box) { return; }
      var imgs = (C.gallery && C.gallery.images) || [];
      var pick = imgs.slice(0, 6);
      var html = '';
      pick.forEach(function (img, i) {
        var tilt = (i % 2 === 0 ? -2.6 : 2.2);
        html +=
          '<span class="gate-photo" style="--pd:' + (0.15 + i * 0.11).toFixed(2) + 's;--pt:' + tilt.toFixed(1) + 'deg">' +
            '<img src="' + img.src + '" alt="' + (img.caption || 'ذكريات') + '" loading="lazy" decoding="async">' +
          '</span>';
      });
      box.innerHTML = html;

      // لو صورة ناقصة: أيقونة بدلها بدل ما يبوظ الشكل
      Array.prototype.forEach.call(box.querySelectorAll('img'), function (img) {
        img.addEventListener('error', function () {
          var wrap = img.parentNode;
          wrap.classList.add('gate-photo--bad');
          img.remove();
          wrap.textContent = '📷';
        });
      });
    }

    /* ---------- الإجابة الصحيحة: الصور تظهر جوه البوب أب ---------- */
    function revealPhotos() {
      var P = (G.album && G.album.photos) || {};
      var T = $('albModalTitle');
      if (T) { T.textContent = P.title || 'برافو عليكي 🤍'; }

      show('photos');
      renderPhotos();
      unlocked = true;

      if (App.share) { App.share.toast(P.toast || 'برافو عليكي 🤍'); }
      burstAt(modal.querySelector('.modal-panel'));
    }

    function init() {
      modal = document.getElementById('albumModal');
      if (!modal) { return; }

      Array.prototype.forEach.call(modal.querySelectorAll('[data-alb-step]'), function (el) {
        steps[el.getAttribute('data-alb-step')] = el;
      });

      var A = (G.album && G.album.ask) || {};
      var P = (G.album && G.album.photos) || {};
      var input = $('albAnswer');

      // نصوص من content.js
      $('albAskText').textContent = A.text || '';
      if (input) { input.placeholder = A.placeholder || 'اكتبي الكلمتين هنا...'; }
      $('albCheck').textContent = A.btn || 'شوكي 😄';
      $('albPhotosText').textContent = P.text || '';
      $('albOpen').textContent = P.btnAlbum || 'افتحي الألبوم 📸';
      $('albGoChat').textContent = P.btnChat || 'كملي القراءة 🤍';

      bindClose(modal, 'data-close-album-gate', close);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) { close(); }
      });

      // التأكد من الإجابة: لازم الكلمتين مع بعض
      function check() {
        var s = normalizeText(input.value);
        var answers = A.answers || ['قلبها', 'قلب مزتك'];
        var pass = !!s && answers.every(function (a) {
          var n = normalizeText(a);
          if (!n) { return true; }
          if (s.indexOf(n) !== -1) { return true; }
          // نسمح كمان بـ "مزتي" بدل "مزتك" والعكس
          var alt = n.indexOf('مزتك') !== -1 ? n.replace('مزتك', 'مزتي')
                  : n.indexOf('مزتي') !== -1 ? n.replace('مزتي', 'مزتك') : null;
          return alt ? s.indexOf(alt) !== -1 : false;
        });
        if (pass) {
          revealPhotos();
        } else {
          attempts += 1;
          var noteEl = $('albWrongNote');
          if (noteEl) {
            var msg = A.wrongNote || 'لأ مش كده 😅 حاولي تاني';
            if (attempts >= 2 && A.hint) { msg = msg + ' ' + A.hint; }
            noteEl.textContent = msg;
            noteEl.hidden = false;
          }
          if (input) {
            input.classList.add('shake');
            setTimeout(function () { input.classList.remove('shake'); }, 450);
          }
        }
      }
      $('albCheck').addEventListener('click', check);
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { check(); }
        });
      }

      // فتح واجهة الصور (الألبوم) بأنيميشن
      $('albOpen').addEventListener('click', function () {
        close();
        setTimeout(function () {
          if (App.gallery && App.gallery.openAlbum) { App.gallery.openAlbum(); }
        }, 300);
      });

      // أو تكميل القراءة: رجوع لواجهة الذكريات
      $('albGoChat').addEventListener('click', function () {
        close();
        setTimeout(function () {
          var mem = document.getElementById('memories');
          if (mem) { mem.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }, 300);
      });
    }

    return { init: init, request: request };
  })();

  /* =========================================================
     تشغيل البوابات
     ========================================================= */
  App.gate = {
    init: function () {
      MemGate.init();
      AlbumGate.init();
    },
    requestAlbum: function () { AlbumGate.request(); }
  };

})(window.App);