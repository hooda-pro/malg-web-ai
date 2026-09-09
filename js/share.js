/* ============================================================
   share.js — زر المشاركة + رسائل التوست:
   - Web Share API لو متاح (موبايل غالباً)
   - غير كده: نسخ اللينك مع رسالة لطيفة
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};
  var toastEl, toastTimer = null;

  /* ---------- توست: رسالة صغيرة بتظهر تحت ---------- */
  function toast(msg, ms) {
    if (!toastEl) toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
  }

  function shareUrl() {
    return (C.meta && C.meta.url) ? C.meta.url : location.href;
  }

  /* ---------- نسخ نص (بالبديل القديم كمان) ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (err) {
        reject(err);
      }
      document.body.removeChild(ta);
    });
  }

  /* ---------- المشاركة ---------- */
  function doShare() {
    var S = C.share || {};
    var data = {
      title: (S.title || document.title),
      text: (S.text || ''),
      url: shareUrl()
    };

    if (navigator.share) {
      navigator.share(data)
        .then(function () { toast(S.toastShared || 'تمام! ابعتيلها دلوقتي 🎁'); })
        .catch(function () { /* المستخدم قفل نافذة المشاركة — مفيش حاجة */ });
      return;
    }

    copyText(data.url)
      .then(function () { toast(S.toastCopied || 'اتنسخ اللينك ❤️ ابعتيلها'); })
      .catch(function () { toast(data.url); });
  }

  App.share = {
    init: function () {
      var fab = document.getElementById('shareFab');
      var btn = document.getElementById('shareBtn');
      if (fab) fab.addEventListener('click', doShare);
      if (btn) btn.addEventListener('click', doShare);
    },
    doShare: doShare,
    toast: toast
  };

})(window.App);
