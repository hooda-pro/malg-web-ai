/* ============================================================
   gallery.js — ألبوم الصور:
   - واجهة ألبوم بشاشة كاملة بتفتح من الزر (أو من بوب أب البوابة)
   - الصور بترندر أول ما الألبوم يتفتح بس (توفير تحميل للموبايل)
   - كل صورة تحتها كلام، وقابلة للضغط (تفتح بالحجم الكامل)
   - وكل صورة عليها زر تنزيل ⬇️
   - لو صورة مش موجودة بيظهر مكان واضح مكتوب فيه اسمها
   - الألبوم بيفتح بأنيميشن: الصور بتنط واحدة ورا التانية
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};
  var images = (C.gallery && C.gallery.images) || [];
  var album, albumMenu, albumBody;
  var rendered = false;   // رندر الصور بيتأجل لأول فتح (توفير تحميل على الموبايل)

  function fileName(src) {
    return String(src || 'photo.jpg').split('/').pop();
  }

  /* ---------- عرض البطاقات ---------- */
  function renderGallery() {
    var box = document.getElementById('polaroids');
    if (!box) return;
    var html = '';
    images.forEach(function (img, i) {
      var wide = img.wide ? ' wide' : '';
      html +=
        '<div class="polaroid-slot reveal r-up' + wide + '" style="--d:' + ((i % 4) * 0.08).toFixed(2) + 's">' +
          '<div class="polaroid' + (img.wide ? ' polaroid--wide' : '') + '" role="button" tabindex="0" data-idx="' + i + '">' +
            '<span class="ph-frame">' +
              (img.date ? '<span class="ph-date">' + img.date + '</span>' : '') +
              '<img src="' + img.src + '" alt="' + (img.caption || 'ذكريات') + '" loading="lazy" decoding="async">' +
              '<a class="ph-dl" href="' + img.src + '" download="' + fileName(img.src) + '" aria-label="تنزيل الصورة" title="تنزيل الصورة">' +
                '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
              '</a>' +
            '</span>' +
            '<span class="ph-cap">' + (img.caption || '') + '</span>' +
          '</div>' +
        '</div>';
    });
    box.innerHTML = html;

    /* ظهور ناعم لما الصورة تخلص تحميل + مكان واضح لو ناقصة */
    Array.prototype.forEach.call(box.querySelectorAll('.ph-frame img'), function (img) {
      img.addEventListener('load', function () { img.classList.add('loaded'); });
      img.addEventListener('error', function () {
        var frame = img.parentNode;
        var src = img.getAttribute('src');
        var dl = frame.querySelector('.ph-dl');
        if (dl) { dl.remove(); }
        img.remove();
        var fb = document.createElement('span');
        fb.className = 'ph-fallback';
        fb.textContent = '📷 حطي الصورة هنا: ' + src;
        frame.appendChild(fb);
      });
    });

    /* الضغط على الصورة: تفتح بالحجم الكامل في تاب جديد
       (ومن التاب تقدري تعملي save برضه) */
    Array.prototype.forEach.call(box.querySelectorAll('.polaroid'), function (card) {
      function openFull() {
        var item = images[parseInt(card.getAttribute('data-idx'), 10)];
        if (item && item.src) {
          window.open(item.src, '_blank', 'noopener');
        }
      }
      card.addEventListener('click', openFull);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { openFull(); }
      });
    });

    /* زر التنزيل مينفعش يفتح الصورة كمان — نوقف انتشار الضغطة */
    Array.prototype.forEach.call(box.querySelectorAll('.ph-dl'), function (dl) {
      dl.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  /* ---------- واجهة الألبوم (الشاشة الكاملة) ---------- */
  function albumOpen() {
    if (!album) return;
    if (!rendered) { rendered = true; renderGallery(); }
    album.classList.add('open');
    album.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    if (albumBody) { albumBody.scrollTop = 0; }

    /* دخول متدرج: الصور بتنط واحدة ورا التانية كل مرة الألبوم يتفتح */
    var slots = album.querySelectorAll('.polaroid-slot');
    if (App.reducedMotion()) {
      Array.prototype.forEach.call(slots, function (s) { s.classList.add('in'); });
    } else {
      Array.prototype.forEach.call(slots, function (s, i) {
        s.classList.remove('in');
        s.style.transitionDelay = (0.15 + i * 0.055).toFixed(2) + 's';
      });
      void album.offsetWidth;   // reflow عشان الحركة تشتغل من الأول
      Array.prototype.forEach.call(slots, function (s) { s.classList.add('in'); });
    }
  }

  function albumClose() {
    if (!album) return;
    if (albumMenu) { albumMenu.hidden = true; }
    album.classList.remove('open');
    album.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
  }

  function initAlbum() {
    album = document.getElementById('album');
    if (!album) return;
    albumMenu = document.getElementById('albumMenu');
    albumBody = album.querySelector('.album-body');

    var openBtn = document.getElementById('openAlbum');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        // البوابة (سؤال التاريخ + الصور) بتظهر الأول، وبعدين الألبوم بيتفتح بأنيميشن
        if (App.gate && App.gate.requestAlbum) { App.gate.requestAlbum(); }
        else { albumOpen(); }
      });
    }

    Array.prototype.forEach.call(album.querySelectorAll('[data-close-album]'), function (el) {
      el.addEventListener('click', albumClose);
    });

    var menuBtn = document.getElementById('albumMenuBtn');
    if (menuBtn) menuBtn.addEventListener('click', function () {
      albumMenu.hidden = !albumMenu.hidden;
    });

    var oldest = document.getElementById('albumOldestFirst');
    if (oldest) oldest.addEventListener('click', function () {
      if (albumMenu) { albumMenu.hidden = true; }
      if (App.share) { App.share.toast('أيوه كل ده مرتبين من الأول للآخر 🤍'); }
    });

    var dlHelp = document.getElementById('albumDlHelp');
    if (dlHelp) dlHelp.addEventListener('click', function () {
      if (albumMenu) { albumMenu.hidden = true; }
      if (App.share) { App.share.toast('دوسي على السهم ⬇️ اللي على أي صورة وهي تنزل 🤍'); }
    });

    var count = document.getElementById('albumCount');
    if (count) count.textContent = '(' + images.length + ' صورة)';

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && album.classList.contains('open')) {
        albumClose();
      }
    });
  }

  App.gallery = {
    /* الرندر اتأجل لأول فتح — الصور مش بتتحمل غير لما الألبوم يتفتح */
    init: function () { initAlbum(); },
    openAlbum: albumOpen,
    closeAlbum: albumClose
  };

})(window.App);
