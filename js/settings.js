/* ============================================================
   settings.js — الإعدادات (الأيقونة اللي تحت زر المشاركة):
   1) وضع داكن / عادي
   2) الخط: رقعة (الافتراضي) / عادي
   3) إخفاء الشريط اللي تحت (النافيجيشن السفلي)
   الاختيارات بتتحفظ على الجهاز (localStorage) وبتتطبق فورًا
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var KEY = 'fati:settings:v1';

  /* الافتراضي: نفس شكل الموقع الأصلي (فاتح + خط رقعة + الشريط ظاهر) */
  var state = { theme: 'light', font: 'ruqaa', nav: 'show' };

  var THEME_COLOR = { light: '#6b2737', dark: '#1d1016' };

  /* ---------- حفظ وقراءة ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) { return; }
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (data.theme === 'dark' || data.theme === 'light') { state.theme = data.theme; }
        if (data.font === 'ruqaa' || data.font === 'normal') { state.font = data.font; }
        if (data.nav === 'show' || data.nav === 'hide') { state.nav = data.nav; }
      }
    } catch (e) { /* لو التخزين مش متاح: نكمل بالافتراضي */ }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
  }

  /* ---------- تطبيق الاختيارات على الصفحة ---------- */
  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === 'dark') { root.setAttribute('data-theme', 'dark'); }
    else { root.removeAttribute('data-theme'); }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', THEME_COLOR[state.theme] || THEME_COLOR.light); }
  }

  function applyFont() {
    var root = document.documentElement;
    if (state.font === 'normal') { root.setAttribute('data-font', 'normal'); }
    else { root.removeAttribute('data-font'); }
  }

  function applyNav() {
    document.body.classList.toggle('nav-hidden', state.nav === 'hide');
  }

  function applyAll() {
    applyTheme();
    applyFont();
    applyNav();
  }

  /* نطبّق فورًا أول ما الملف يتحمّل — عشان مفيش وميض للوضع الفاتح */
  load();
  applyAll();

  /* =========================================================
     واجهة الإعدادات (المودال)
     ========================================================= */
  var modal = null;
  var els = {};

  function syncUI() {
    if (els.dark) {
      els.dark.classList.toggle('on', state.theme === 'dark');
      els.dark.setAttribute('aria-checked', state.theme === 'dark' ? 'true' : 'false');
    }
    if (els.hideNav) {
      els.hideNav.classList.toggle('on', state.nav === 'hide');
      els.hideNav.setAttribute('aria-checked', state.nav === 'hide' ? 'true' : 'false');
    }
    if (els.fontRuqaa) { els.fontRuqaa.classList.toggle('active', state.font === 'ruqaa'); }
    if (els.fontNormal) { els.fontNormal.classList.toggle('active', state.font === 'normal'); }
  }

  function toast(msg) {
    if (App.share && App.share.toast) { App.share.toast(msg); }
  }

  function open() {
    if (!modal) { return; }
    syncUI();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
  }

  function close() {
    if (!modal) { return; }
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
  }

  /* ---------- الأحداث ---------- */
  function init() {
    modal = document.getElementById('settingsModal');
    var fab = document.getElementById('settingsFab');
    els.dark = document.getElementById('setDark');
    els.hideNav = document.getElementById('setHideNav');
    els.fontRuqaa = document.getElementById('fontRuqaa');
    els.fontNormal = document.getElementById('fontNormal');

    if (fab) { fab.addEventListener('click', open); }

    if (modal) {
      Array.prototype.forEach.call(modal.querySelectorAll('[data-close-settings]'), function (el) {
        el.addEventListener('click', close);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) { close(); }
      });
    }

    /* الوضع الداكن */
    if (els.dark) {
      els.dark.addEventListener('click', function () {
        state.theme = (state.theme === 'dark') ? 'light' : 'dark';
        applyTheme(); save(); syncUI();
        toast(state.theme === 'dark' ? 'الوضع الداكن اتشغّل 🌙' : 'رجعنا للوضع العادي ☀️');
      });
    }

    /* الخط: رقعة / عادي */
    if (els.fontRuqaa) {
      els.fontRuqaa.addEventListener('click', function () {
        if (state.font === 'ruqaa') { return; }
        state.font = 'ruqaa';
        applyFont(); save(); syncUI();
        toast('رجعنا لخط رقعة (الافتراضي) ✒️');
      });
    }
    if (els.fontNormal) {
      els.fontNormal.addEventListener('click', function () {
        if (state.font === 'normal') { return; }
        state.font = 'normal';
        applyFont(); save(); syncUI();
        toast('الخط بقى عادي 👌');
      });
    }

    /* إخفاء الشريط السفلي */
    if (els.hideNav) {
      els.hideNav.addEventListener('click', function () {
        state.nav = (state.nav === 'hide') ? 'show' : 'hide';
        applyNav(); save(); syncUI();
        toast(state.nav === 'hide' ? 'اتخفي الشريط اللي تحت 🙈' : 'الشريط اللي تحت رجع يظهر 👀');
      });
    }
  }

  App.settings = { init: init, open: open, close: close, state: state, applyAll: applyAll };

})(window.App);