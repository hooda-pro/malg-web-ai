/* ============================================================
   music.js — موسيقى اختيارية تماماً:
   - ممنوع التشغيل التلقائي: الصوت بيشتغل بالزر بس
   - لو مفيش ملف صوت: الزر بيختفي لوحده والموقع يفضل شغال
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};
  var M = C.music || {};

  function init() {
    if (!M.enabled || !M.src) return;
    var audio = document.getElementById('bgMusic');
    var btn = document.getElementById('musicBtn');
    if (!audio || !btn) return;

    audio.src = M.src;

    /* التشغيل/الإيقاف بالزر */
    btn.addEventListener('click', function () {
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) {
          p.catch(function () {
            // الملف مش موجود أو المتصفح منع التشغيل: خفي الزر
            btn.hidden = true;
          });
        }
        btn.classList.add('playing');
        btn.setAttribute('aria-label', 'ايقاف الموسيقى');
      } else {
        audio.pause();
        btn.classList.remove('playing');
        btn.setAttribute('aria-label', 'تشغيل الموسيقى');
      }
    });

    audio.addEventListener('error', function () { btn.hidden = true; });

    /* نتأكد إن الملف موجود قبل ما نظهر الزر.
       fetch برأس Range صغير مش هيحمّل الأغنية (لو مدعوم) */
    if (window.fetch) {
      fetch(M.src, { method: 'GET', headers: { Range: 'bytes=0-1' } })
        .then(function (r) {
          if (r && (r.status === 206 || r.status === 200)) {
            btn.hidden = false;
          }
        })
        .catch(function () {
          /* file:// بيرفض fetch — نظهر الزر باست optimism:
             لو الملف مش موجود فعلاً، أول ضغطة هتفشل في play()
             والزر هيختفي لوحده */
          btn.hidden = false;
        });
    } else {
      btn.hidden = false;
    }
  }

  App.music = { init: init };
})(window.App);
