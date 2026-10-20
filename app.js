/* ===== Калькулятор дробной перегонки — интерфейс ===== */
(function () {
  'use strict';

  const Calc = window.Calc;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const STORAGE_KEY = 'fractional-distillation-calc/v1';

  const DEFAULTS = {
    ssVol: 8,
    ssAbv: 30,
    dilute: true,
    diluteTo: 20,
    raw: 'sugar',
    headsPct: 8,
    headsAuto: true,
    stopAbv: 40,
    bodyAbv: 62,
    washMode: 'vol',
    washVol: 20,
    washAbv: 12,
    sugarKg: 5,
    hydro: 5,
    dilVol: 5,
    dilAbv: 65,
    dilTo: 40,
    tempReading: 40,
    tempC: 25
  };

  let state = Object.assign({}, DEFAULTS);
  let currentTab = 'distill';

  /* ---------- форматирование ---------- */

  const nf = (value, digits) => {
    const n = Number.isFinite(value) ? value : 0;
    return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  const L = (v) => nf(v, 2);
  const L1 = (v) => nf(v, 1);
  const ML = (v) => nf(v, 0);
  const setTxt = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
  };

  /* ---------- состояние ---------- */

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
          const expected = typeof DEFAULTS[key];
          if (typeof saved[key] === expected) state[key] = saved[key];
        }
      });
      if (!Calc.RAW_TYPES[state.raw]) state.raw = DEFAULTS.raw;
    } catch (err) {
      state = Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* приватный режим — просто игнорируем */
    }
  }

  /* ---------- синхронизация полей ---------- */

  function updateRangeFill(key) {
    $$('input[type="range"][data-key="' + key + '"]').forEach((el) => {
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const span = max - min;
      const pct = span > 0 ? ((state[key] - min) / span) * 100 : 0;
      el.style.setProperty('--p', Math.max(0, Math.min(100, pct)) + '%');
    });
  }

  function syncInputs(key) {
    $$('[data-key="' + key + '"]').forEach((el) => {
      if (el.type === 'checkbox') {
        el.checked = Boolean(state[key]);
      } else if (document.activeElement !== el) {
        el.value = state[key];
      }
    });
    updateRangeFill(key);
  }

  function applyStateToInputs() {
    Object.keys(DEFAULTS).forEach((key) => syncInputs(key));

    $$('#rawChips .chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.raw === state.raw);
    });
    $$('#dilChips .chip').forEach((chip) => {
      chip.classList.toggle('is-active', Calc.num(chip.dataset.dilute) === state.dilTo);
    });
    $$('#washMode .seg-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.washmode === state.washMode);
    });
    $('paneVol').hidden = state.washMode !== 'vol';
    $('paneSugar').hidden = state.washMode !== 'sugar';
  }

  /* ---------- расчёты и вывод ---------- */

  function render() {
    renderMain();
    renderWash();
    renderDilute();
    renderTemp();
    renderSticky();
  }

  /* Липкая строка внизу экрана: главное число текущей вкладки.
     Видна только на телефоне (CSS) и только там, где есть что показать. */
  function renderSticky() {
    const bar = $('stickyBar');
    if (!bar) return;

    const show = currentTab === 'distill' || currentTab === 'dilute';
    bar.hidden = !show;
    if (!show) return;

    if (currentTab === 'distill') {
      const f = Calc.fractions(state);
      setTxt('sbVal', L(f.alcohol) + ' л АС');
      setTxt('sbLab', 'напитка 40 %: ' + L(f.drink40) + ' л');
      return;
    }

    const d = Calc.dilute({ volume: state.dilVol, abv: state.dilAbv, target: state.dilTo });
    if (!d.possible) {
      setTxt('sbVal', 'Разбавлять не нужно');
      setTxt('sbLab', nf(state.dilAbv, 1) + ' % уже не выше ' + nf(state.dilTo, 0) + ' %');
    } else {
      setTxt('sbVal', L(d.water) + ' л воды');
      setTxt('sbLab', 'Всего ' + L(d.total) + ' л при ' + nf(state.dilTo, 0) + ' %');
    }
  }

  function renderMain() {
    const s = state;
    const f = Calc.fractions(s);
    const type = Calc.RAW_TYPES[s.raw] || Calc.RAW_TYPES.sugar;

    setTxt('acValue', L(f.alcohol));
    setTxt('acHint', L1(s.ssVol) + ' л × ' + nf(s.ssAbv, 1) + ' % = ' + L(f.alcohol) + ' л АС');

    // полоса фракций
    [['segHeads', f.headsFrac], ['segBody', f.bodyFrac], ['segTails', f.tailsFrac]].forEach(([id, frac]) => {
      const el = $(id);
      const pct = frac * 100;
      el.style.width = pct.toFixed(2) + '%';
      el.classList.toggle('is-tight', pct < 13);
    });

    setTxt('headsVol', ML(f.headsVolume * 1000));
    setTxt('headsSub', L(f.headsAlcohol) + ' л АС · ' + nf(s.headsPct, 0) + ' %');

    setTxt('bodyVol', L(f.bodyVolume));
    setTxt('bodySub', L(f.bodyAlcohol) + ' л АС · ' + nf(s.bodyAbv, 0) + ' %');

    setTxt('tailsVol', L(f.tailsAlcohol));
    setTxt('tailsSub', '≈' + L(f.tailsVolume) + ' л при ' + f.tailsStrength + ' %');

    setTxt('drink40', L(f.drink40) + ' л');
    setTxt('balance', '✓ ' + L(f.alcohol) + ' л АС распределено: головы + тело + хвосты');
    setTxt(
      'headsHint',
      '≈ ' + ML(f.headsVolume * 1000) + ' мл при ' + f.headsStrength + ' % об. Для ' + type.labelGen +
        ' браги норма — ' + type.headsMin + '–' + type.headsMax + ' % от АС.'
    );

    // подсказка про разбавление
    if (!s.dilute) {
      setTxt('diluteHint', 'Без разбавления: в куб идёт ' + L1(s.ssVol) + ' л сырца ' + nf(s.ssAbv, 1) + ' %.');
    } else if (s.ssAbv <= s.diluteTo) {
      setTxt('diluteHint', 'Крепость уже не выше ' + nf(s.diluteTo, 0) + ' % — разбавлять не нужно.');
    } else {
      setTxt(
        'diluteHint',
        'Добавьте ' + L(f.water) + ' л воды — получится ' + L(f.chargeVolume) + ' л заряда ' + nf(f.chargeAbv, 1) + ' %.'
      );
    }

    renderSteps(f);
    renderSugarHint();
  }

  function renderSteps(f) {
    const s = state;
    const steps = [];

    if (s.dilute && f.water > 0.005) {
      steps.push('Разбавить сырец до ' + nf(s.diluteTo, 0) + ' %: влить ' + L(f.water) + ' л воды, получится ' + L(f.chargeVolume) + ' л заряда.');
    } else if (s.dilute) {
      steps.push('Разбавлять не нужно: сырец уже ' + nf(s.ssAbv, 1) + ' %.');
    } else {
      steps.push('Залить сырец как есть: ' + L1(s.ssVol) + ' л ' + nf(s.ssAbv, 1) + ' %.');
    }
    steps.push('Отобрать головы — ' + ML(f.headsVolume * 1000) + ' мл, капельно, это ' + nf(s.headsPct, 1) + ' % от АС.');
    steps.push('Сменить ёмкость: тело — до ' + nf(s.stopAbv, 0) + ' % в струе, ориентир ' + L(f.bodyVolume) + ' л при ' + nf(s.bodyAbv, 0) + ' %.');
    steps.push('Хвосты (' + L(f.tailsAlcohol) + ' л АС) — отдельно, в следующий куб.');
    steps.push('Тело разбавить до питьевой крепости: выйдет ' + L(f.drink40) + ' л при 40 %.');

    const list = $('stepsList');
    list.innerHTML = '';
    steps.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
  }

  function renderWash() {
    let result;
    if (state.washMode === 'sugar') {
      result = Calc.fromSugar({ kg: state.sugarKg, hydro: state.hydro, raw: state.raw });
    } else {
      result = Calc.fromWash({ volume: state.washVol, abv: state.washAbv });
    }
    setTxt('washAc', L(result.alcohol) + ' л');
    setTxt('washSs', L1(result.ssVolume) + ' л');
  }

  function renderSugarHint() {
    const r = Calc.fromSugar({ kg: state.sugarKg, hydro: state.hydro, raw: state.raw });
    setTxt(
      'sugarHint',
      'Вода: ' + L1(r.water) + ' л · брага ≈ ' + L1(r.washVolume) + ' л · крепость ≈ ' + nf(r.washAbv, 1) +
        ' % · выход ≈ ' + L(r.alcohol) + ' л АС. Дрожжи — 20 г прессованных или 4–5 г сухих на 1 кг сахара.'
    );
  }

  function renderDilute() {
    const r = Calc.dilute({ volume: state.dilVol, abv: state.dilAbv, target: state.dilTo });
    setTxt('dilWater', L(r.water));
    setTxt('dilTotal', L(r.total) + ' л');
    setTxt('dilPerLiter', L(r.perLiter) + ' л');

    if (!r.possible) {
      setTxt('dilNote', 'Целевая крепость должна быть ниже исходной — иначе воду добавлять не нужно.');
    } else {
      setTxt(
        'dilNote',
        'Смешивайте постепенно и перемешивайте. Из-за контракции фактическая крепость может выйти на 0,3–0,5 % выше — проверяйте ареометром при 20 °C.'
      );
    }
  }

  function renderTemp() {
    const r = Calc.correctReading({ reading: state.tempReading, tempC: state.tempC });
    setTxt('tempOut', nf(r.corrected, 1));
    setTxt(
      'tempDelta',
      Math.abs(r.delta) < 0.05 ? '0,0 %' : (r.delta > 0 ? '+' : '−') + nf(Math.abs(r.delta), 1) + ' %'
    );
    setTxt('tempK', nf(r.coefficient, 2) + ' %/°C');
  }

  /* ---------- события ---------- */

  function wireInputs() {
    $$('[data-key]').forEach((el) => {
      const key = el.dataset.key;

      el.addEventListener('input', () => {
        if (el.type === 'checkbox') {
          state[key] = el.checked;
        } else {
          state[key] = Calc.num(el.value, 0);
          if (key === 'headsPct') state.headsAuto = false;
        }
        syncInputs(key);
        render();
        save();
      });

      el.addEventListener('change', () => {
        if (el.type === 'checkbox') return;
        const min = el.min !== '' ? parseFloat(el.min) : -Infinity;
        const max = el.max !== '' ? parseFloat(el.max) : Infinity;
        state[key] = Calc.clamp(state[key], min, max);
        syncInputs(key);
        render();
        save();
      });
    });
  }

  function wireChips() {
    $$('#rawChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.raw = chip.dataset.raw;
        const type = Calc.RAW_TYPES[state.raw];
        if (state.headsAuto && type) {
          state.headsPct = type.heads;
          syncInputs('headsPct');
        }
        $$('#rawChips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
        render();
        save();
      });
    });

    $$('#dilChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.dilTo = Calc.num(chip.dataset.dilute, 40);
        syncInputs('dilTo');
        $$('#dilChips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
        render();
        save();
      });
    });
  }

  function wireWashMode() {
    $$('#washMode .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.washMode = btn.dataset.washmode;
        $$('#washMode .seg-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        $('paneVol').hidden = state.washMode !== 'vol';
        $('paneSugar').hidden = state.washMode !== 'sugar';
        render();
        save();
      });
    });

    $('applyWash').addEventListener('click', () => {
      const result =
        state.washMode === 'sugar'
          ? Calc.fromSugar({ kg: state.sugarKg, hydro: state.hydro, raw: state.raw })
          : Calc.fromWash({ volume: state.washVol, abv: state.washAbv });

      state.ssVol = Math.round(result.ssVolume * 10) / 10;
      state.ssAbv = result.ssStrength;
      syncInputs('ssVol');
      syncInputs('ssAbv');
      render();
      save();
      toasts('В расчёт подставлено: ' + L1(state.ssVol) + ' л сырца ' + state.ssAbv + ' %.');
      $('washCard').open = false;
    });
  }

  function activateTab(name, remember) {
    const tabs = $$('.tab');
    const known = tabs.some((t) => t.dataset.tab === name);
    const target = known ? name : (tabs[0] && tabs[0].dataset.tab) || 'distill';

    currentTab = target;
    tabs.forEach((t) => {
      const active = t.dataset.tab === target;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.tabIndex = active ? 0 : -1;
    });
    $$('.panel').forEach((panel) => {
      const active = panel.id === 'panel-' + target;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    renderSticky();

    if (remember) {
      try {
        window.history.replaceState(null, '', '#' + target);
      } catch (err) {
        /* file:// в некоторых браузерах запрещает replaceState */
      }
    }
    return target;
  }

  function wireTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab, true));
    });
    window.addEventListener('hashchange', () => {
      activateTab(window.location.hash.replace('#', ''), false);
    });
  }

  let toastTimer = null;
  function toasts(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function buildReport() {
    const s = state;
    const f = Calc.fractions(s);
    const lines = [
      'Дробная перегонка — расчёт',
      'Сырец: ' + L1(s.ssVol) + ' л, ' + nf(s.ssAbv, 1) + ' % об. → ' + L(f.alcohol) + ' л АС',
      s.dilute && f.water > 0.005
        ? 'Разбавление до ' + nf(s.diluteTo, 0) + ' %: +' + L(f.water) + ' л воды, заряд ' + L(f.chargeVolume) + ' л'
        : 'Без разбавления',
      'Головы: ' + ML(f.headsVolume * 1000) + ' мл (' + nf(s.headsPct, 1) + ' % от АС, ≈' + f.headsStrength + ' % об.)',
      'Тело: ' + L(f.bodyVolume) + ' л при ' + nf(s.bodyAbv, 0) + ' % об. (' + L(f.bodyAlcohol) + ' л АС), отбор до ' + nf(s.stopAbv, 0) + ' % в струе',
      'Хвосты: ' + L(f.tailsAlcohol) + ' л АС (≈' + L(f.tailsVolume) + ' л при ' + f.tailsStrength + ' %)',
      'Напиток 40 %: ' + L(f.drink40) + ' л',
      '',
      'Калькулятор дробной перегонки'
    ];
    return lines.join('\n');
  }

  async function copyReport() {
    const text = buildReport();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toasts('Расчёт скопирован');
    } catch (err) {
      toasts('Не удалось скопировать — выделите текст вручную');
    }
  }

  function wireCopy() {
    // Кнопка в карточке и кнопка в липкой строке делают одно и то же.
    ['copyBtn', 'sbBtn'].forEach((id) => {
      const btn = $(id);
      if (btn) btn.addEventListener('click', copyReport);
    });
  }

  function wireReset() {
    $('resetBtn').addEventListener('click', () => {
      state = Object.assign({}, DEFAULTS);
      applyStateToInputs();
      render();
      save();
      toasts('Данные сброшены');
    });
  }

  /* ---------- старт ---------- */

  /* Вкладку можно открыть сразу: index.html#guide или index.html?tab=dilute */
  function initialTab() {
    const hash = (window.location.hash || '').replace('#', '');
    if (hash) return hash;
    try {
      return new URLSearchParams(window.location.search).get('tab') || '';
    } catch (err) {
      return '';
    }
  }

  load();
  applyStateToInputs();
  wireInputs();
  wireChips();
  wireWashMode();
  wireTabs();
  wireCopy();
  wireReset();
  render();
  activateTab(initialTab(), false);
})();
