/* ============================================================
   story.js — فصول الحكاية (البطاقات + المودال)،
   خط الزمن، وكلام لسه فاكره
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};

  /* ---------- فصول الحكاية ---------- */
  function renderChapters() {
    var box = document.getElementById('chapters');
    if (!box || !C.chapters) return;
    var html = '';
    C.chapters.forEach(function (ch, i) {
      var num = (i + 1 < 10 ? '0' : '') + (i + 1);
      html +=
        '<button class="chapter reveal r-scale" type="button" data-ch="' + i + '" style="--d:' + (i * 0.08).toFixed(2) + 's">' +
          '<span class="chapter-num">' + num + '</span>' +
          '<span class="chapter-icon" aria-hidden="true">' + ch.icon + '</span>' +
          '<h3>' + ch.title + '</h3>' +
          '<p>' + ch.teaser + '</p>' +
          '<span class="chapter-cta">افتحي الفصل <span aria-hidden="true">←</span></span>' +
        '</button>';
    });
    box.innerHTML = html;

    Array.prototype.forEach.call(box.querySelectorAll('.chapter'), function (btn) {
      btn.addEventListener('click', function () {
        openChapter(parseInt(btn.getAttribute('data-ch'), 10));
      });
    });
  }

  /* ---------- مودال الفصول ---------- */
  var modal, modalKicker, modalTitle, modalBody, modalNext;
  var current = 0;

  function fillModal(i) {
    var ch = C.chapters[i];
    if (!ch) return;
    current = i;
    modalKicker.textContent = 'الفصل ' + (i + 1) + ' من ' + C.chapters.length;
    modalTitle.textContent = ch.icon + ' ' + ch.title;

    var html = '';
    (ch.paragraphs || []).forEach(function (p) {
      html += '<p>' + p + '</p>';
    });
    if (ch.callback) {
      html += '<p class="cb-q">' + ch.callback.q + '</p>';
      html += '<p class="cb-a">' + ch.callback.a + '</p>';
    }
    
    modalBody.innerHTML = html;
    modalBody.scrollTop = 0;

    var last = i === C.chapters.length - 1;
    modalNext.textContent = last ? 'خلصت الحكاية ❤️' : 'الفصل اللي بعده ←';
  }

  function openChapter(i) {
    fillModal(i);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
  }

  function initModal() {
    modal = document.getElementById('chapterModal');
    if (!modal) return;
    modalKicker = document.getElementById('modalKicker');
    modalTitle = document.getElementById('modalTitle');
    modalBody = document.getElementById('modalBody');
    modalNext = document.getElementById('modalNext');

    modalNext.addEventListener('click', function () {
      if (current >= C.chapters.length - 1) { closeModal(); return; }
      fillModal(current + 1);
    });

    // تفويض الأحداث: بيشمل العناصر اللي بتتعمل ديناميكياً
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  /* ---------- خط الزمن ---------- */
  function renderTimeline() {
    var box = document.getElementById('timeline');
    if (!box || !C.timeline) return;
    // خط بتدرج بيتملّي مع السكرول (بيتحدث من effects.js)
    var html = '<span class="tl-progress" aria-hidden="true"></span>';
    C.timeline.forEach(function (st, i) {
      html +=
        '<li class="tl-item reveal ' + (i % 2 === 0 ? 'r-left' : 'r-right') + '" style="--d:' + ((i % 3) * 0.08).toFixed(2) + 's">' +
          '<span class="tl-dot" aria-hidden="true"></span>' +
          '<div class="tl-card">' +
            '<h3 class="tl-title"><span class="tl-index">' + (i + 1) + '</span>' + st.title + '</h3>' +
            '<p class="tl-text">' + st.text + '</p>' +
          '</div>' +
        '</li>';
    });
    box.innerHTML = html;
  }

  /* ---------- كلام لسه فاكره ---------- */
  function renderChat() {
    var box = document.getElementById('chat');
    if (!box || !C.chat || !C.chat.bubbles) return;
    var html = '';
    C.chat.bubbles.forEach(function (b, i) {
      var cls = b.from === 'special' ? 'bubble--special' : 'bubble--' + b.from;
      // كل جهة ليها حركة دخول مختلفة (سينمائية أكتر)
      var reveal = b.from === 'me' ? 'r-left' : (b.from === 'her' ? 'r-right' : 'r-scale');
      html += '<div class="bubble ' + cls + ' reveal ' + reveal + '" style="--d:' + (i * 0.09).toFixed(2) + 's">' + b.text + '</div>';
    });
    box.innerHTML = html;
  }

  App.story = {
    init: function () {
      renderChapters();
      initModal();
      renderTimeline();
      renderChat();
    },
    closeModal: closeModal
  };

})(window.App);
