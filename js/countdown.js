/* ============================================================
   countdown.js — العد التنازلي لعيد الميلاد (10/4/2027)
   - بيحدث مباشر من غير Reload
   - يوم العيد بيتحول تلقائياً لرسالة عيد ميلاد + كونفيتي خفيف
   ============================================================ */

window.App = window.App || {};

(function (App) {
  'use strict';

  var C = window.SITE_CONTENT || {};
  var B = C.birthday || {};
  var timer = null;
  var birthdayMode = false;

  /* ---------- تحويل التاريخ لنطاق اليوم (من أول اليوم لآخره) ---------- */
  function dayRange(iso) {
    var parts = String(iso || '2027-04-10').split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    return {
      start: new Date(y, m, d, 0, 0, 0, 0),
      end: new Date(y, m, d, 23, 59, 59, 999)
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function setTile(id, val) {
    var el = document.getElementById(id);
    if (el && el.textContent !== val) el.textContent = val;
  }

  /* ---------- وضع عيد الميلاد ---------- */
  function showBirthdayMessage() {
    birthdayMode = true;
    var cd = document.getElementById('countdown');
    var msg = document.getElementById('bdayMsg');
    var wait = document.getElementById('bdayWait');
    if (cd) cd.classList.add('over');
    if (wait) wait.hidden = true;
    if (msg) {
      var big = document.getElementById('bdayBig');
      var small = document.getElementById('bdaySmall');
      if (big) big.textContent = B.bigLine || 'النهارده فطومتي كملت سنة كمان 💘';
      if (small) small.textContent = B.smallLine || 'كل سنة وانتي طيبة ❤️';
      msg.hidden = false;
    }
    attachBirthdayConfetti();
  }

  /* كونفيتي خفيف بس لما قسم عيد الميلاد يكون ظاهر على الشاشة */
  function attachBirthdayConfetti() {
    if (App.reducedMotion() || !App.effects || !App.effects.Confetti) return;
    var section = document.getElementById('birthday');
    if (!section || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        App.effects.Confetti.setGentle(entry.isIntersecting && birthdayMode);
      });
    }, { threshold: 0.25 });
    io.observe(section);
  }

  /* ---------- التكة كل ثانية ---------- */
  function tick() {
    var now = new Date();
    var range = dayRange(B.dateISO);

    // جوه يوم العيد أو بعده: رسالة بدل العداد
    if (now >= range.start) {
      if (!birthdayMode) showBirthdayMessage();
      if (now > range.end) stop();
      return;
    }

    var diff = range.start - now;
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    var secs = Math.floor((diff % 60000) / 1000);

    setTile('cdDays', String(days));
    setTile('cdHours', pad(hours));
    setTile('cdMins', pad(mins));
    setTile('cdSecs', pad(secs));
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function init() {
    var dateEl = document.getElementById('bdayDate');
    if (dateEl && B.dateText) dateEl.textContent = B.dateText;
    var wait = document.getElementById('bdayWait');
    if (wait && B.waitLine) wait.textContent = B.waitLine;

    tick();
    timer = setInterval(tick, 1000);
  }

  App.countdown = { init: init };
})(window.App);
