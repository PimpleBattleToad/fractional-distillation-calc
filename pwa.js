/* ===== Телефонная обвязка: офлайн-кэш, Telegram, автоподгонка, диагностика =====
   Этот файл ничего не считает. Он отвечает только за то, чтобы страница
   нормально жила на телефоне: открывалась без интернета, влезала в экран
   и запускалась внутри Telegram. Если чего-то из этого нет — просто молчит. */
(function () {
  'use strict';

  var BUILD = 'v1.2 · 2026-10-20';

  /* ---------- офлайн-режим ----------
     Кэш и установка на главный экран работают, только если страница открыта
     с сервера (https или localhost). Для file:// браузер service worker запрещает. */
  var canUseSW =
    typeof navigator !== 'undefined' &&
    navigator.serviceWorker &&
    typeof location !== 'undefined' &&
    (location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1');

  if (canUseSW) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        /* нет доступа — страница всё равно работает */
      });
    });
  }

  /* ---------- запуск внутри Telegram (Mini App) ---------- */
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var diagEl = document.getElementById('diag');
  var wantDiag =
    typeof location !== 'undefined' && String(location.search).indexOf('debug') !== -1;

  function updateDiag() {
    if (!diagEl || !wantDiag) return;
    try {
      var vw = document.documentElement.clientWidth;
      var vv = window.visualViewport;
      var visible = vv ? Math.round(vv.width) : vw;
      var zoom = document.documentElement.style.zoom
        ? ' · ужато до ' + document.documentElement.style.zoom
        : '';

      var worst = null;
      var worstRight = vw + 1;
      var all = document.body.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el === diagEl) continue;
        var box = el.getBoundingClientRect();
        if (box.width > 0 && box.right > worstRight) {
          worstRight = box.right;
          worst = el;
        }
      }

      var head = '';
      if (worst) {
        head =
          'ВЫЛЕЗАЕТ ' +
          worst.tagName.toLowerCase() +
          (worst.className ? '.' + String(worst.className).split(' ')[0] : '') +
          ' ' +
          Math.round(worstRight) +
          '>' +
          vw +
          ' · ';
      }

      diagEl.textContent =
        head +
        BUILD +
        ' · ширина ' +
        vw +
        ' · видно ' +
        visible +
        ' · масштаб ' +
        (vv ? Math.round(vv.scale * 100) / 100 : 1) +
        (tg ? ' · TG ' + Math.round(tg.viewportWidth || 0) + '×' + Math.round(tg.viewportHeight || 0) : '') +
        ' · dpr ' +
        (window.devicePixelRatio || 1) +
        (tg ? ' · ' + (tg.platform || '?') : '') +
        zoom;
      diagEl.hidden = false;
    } catch (err) {
      /* диагностика не должна ломать страницу */
    }
  }

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#100e0c');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#100e0c');
    } catch (err) {
      /* старая версия клиента — не страшно */
    }

    /* В Telegram на телефоне всегда одна колонка: WebView может сообщить
       широкий вьюпорт, и тогда включилась бы «настольная» раскладка. */
    var tgMobile =
      tg.platform === 'android' ||
      tg.platform === 'ios' ||
      (typeof window.innerWidth === 'number' && window.innerWidth <= 900);

    if (tgMobile && document.documentElement) {
      document.documentElement.className += ' tg';
    }

    /* Автоподгонка: если WebView не ужал страницу сам, ужимаем её мы,
       иначе правый край просто обрежется. */
    var fitApplied = false;
    function fitToScreen() {
      try {
        var vv = window.visualViewport;
        var vw = document.documentElement.clientWidth;
        if (!fitApplied && vv && vv.width > 0 && vw > vv.width * 1.05 + 2) {
          fitApplied = true;
          document.documentElement.style.zoom = Math.round((vv.width / vw) * 1000) / 1000;
        }
      } catch (err) {
        /* не критично */
      }
    }

    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    window.addEventListener('load', fitToScreen);
  }

  updateDiag();
  window.addEventListener('resize', updateDiag);
  window.addEventListener('orientationchange', updateDiag);
})();
