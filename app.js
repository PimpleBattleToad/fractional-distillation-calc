/* ===== Калькулятор дробной перегонки — интерфейс ===== */
(function () {
  'use strict';

  const Calc = window.Calc;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const STORAGE_KEY = 'fractional-distillation-calc/v2';
  const LEGACY_KEY = 'fractional-distillation-calc/v1';
  // при переезде на версию 2 эти поля берём из новых настроек, а не из старых
  const LEGACY_MODE_KEYS = ['mode', 'stopAbv', 'diluteTo', 'headsPct'];

  const DEFAULTS = {
    mode: 'column',
    ssVol: 8,
    ssAbv: 30,
    dilute: true,
    diluteTo: 35,
    raw: 'sugar',
    headsPct: 3,
    headsAuto: true,
    stopAbv: 95,
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
  // 96,6 показываем как есть, 62 — без дробной части
  const strengthTxt = (v) => nf(v, Number.isInteger(Number(v)) ? 0 : 1);
  const setTxt = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
  };

  /* ---------- состояние ---------- */

  function load() {
    try {
      let raw = window.localStorage.getItem(STORAGE_KEY);
      let migrated = false;
      if (!raw) {
        // перенос из первой версии: цифры сохраняем, аппарат берём новый — колонну
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy);
          LEGACY_MODE_KEYS.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(old, key)) delete old[key];
          });
          raw = JSON.stringify(old);
          window.localStorage.removeItem(LEGACY_KEY);
          migrated = true;
        }
      }
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
          const expected = typeof DEFAULTS[key];
          if (typeof saved[key] === expected) state[key] = saved[key];
        }
      });
      if (!Calc.RAW_TYPES[state.raw]) state.raw = DEFAULTS.raw;
      if (!Calc.MODES[state.mode]) state.mode = DEFAULTS.mode;
      // перенесённое сразу оседает в новом ключе: иначе данные живут только в памяти
      if (migrated) save();
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

  /* У колонны свои границы отбора и своя крепость тела,
     поэтому часть полей перестраивается при смене аппарата. */
  function applyModeUi() {
    const isColumn = state.mode === 'column';

    $$('#deviceMode .seg-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === state.mode);
    });

    const bounds = isColumn ? { min: 80, max: 96, step: 0.5 } : { min: 20, max: 60, step: 1 };
    ['stopNum', 'stopRange'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.min = String(bounds.min);
      el.max = String(bounds.max);
      el.step = String(bounds.step);
    });
    state.stopAbv = Calc.clamp(state.stopAbv, bounds.min, bounds.max);

    const bodyRow = $('bodyRow');
    if (bodyRow) bodyRow.hidden = isColumn;
    const bodyFixed = $('bodyFixed');
    if (bodyFixed) bodyFixed.hidden = !isColumn;

    setTxt('stopLabel', isColumn ? 'Тело — до падения крепости' : 'Тело — до крепости в струе');
  }

  function applyStateToInputs() {
    applyModeUi();
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
    const isColumn = f.mode === 'column';

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
    setTxt('bodySub', L(f.bodyAlcohol) + ' л АС · ' + strengthTxt(f.bodyAbv) + ' %');

    setTxt('tailsVol', L(f.tailsAlcohol));
    setTxt('tailsSub', '≈' + L(f.tailsVolume) + ' л при ' + strengthTxt(f.tailsStrength) + ' %');

    setTxt('drink40', L(f.drink40) + ' л');
    setTxt('balance', '✓ ' + L(f.alcohol) + ' л АС распределено: головы + тело + хвосты');
    setTxt(
      'headsHint',
      isColumn
        ? '≈ ' + ML(f.headsVolume * 1000) + ' мл при ' + strengthTxt(f.headsStrength) + ' % об. Ректификация: для ' +
          type.labelGen + ' браги головы ' + type.recHeadsMin + '–' + type.recHeadsMax + ' % от АС.'
        : '≈ ' + ML(f.headsVolume * 1000) + ' мл при ' + strengthTxt(f.headsStrength) + ' % об. Для ' + type.labelGen +
          ' браги норма — ' + type.headsMin + '–' + type.headsMax + ' % от АС.'
    );

    setTxt(
      'modeHint',
      isColumn
        ? 'Ректификация: в струе 96,6 % об., головы капельно, тело почти без запаха.'
        : 'Дробная перегонка: в струе 60–70 % об., тело пахнет сырьём.'
    );

    setTxt(
      'stopHint',
      isColumn
        ? 'Отбор прекращают, когда крепость в струе падает ниже ' + nf(f.stopAbv, 1) +
          ' %: остаток уже хвосты. Контроль по кубу — 95–98 °C.'
        : 'Ниже ' + nf(f.stopAbv, 1) + ' % в струе в тело идут сивушные масла. Для колонны ориентир — 92–93 °C в кубе.'
    );

    setTxt('diluteLabel', 'Разбавить перед перегонкой до ' + nf(s.diluteTo, 0) + ' % об.');

    // подсказка про разбавление
    if (!s.dilute) {
      setTxt('diluteHint', 'Без разбавления: в куб идёт ' + L1(s.ssVol) + ' л сырца ' + nf(s.ssAbv, 1) + ' %.');
    } else if (s.ssAbv <= s.diluteTo) {
      setTxt(
        'diluteHint',
        isColumn
          ? 'Сырец уже ' + nf(s.ssAbv, 1) + ' % — для колонны это рабочая крепость заряда (30–40 %), разбавлять не нужно.'
          : 'Крепость уже не выше ' + nf(s.diluteTo, 0) + ' % — разбавлять не нужно.'
      );
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
    const isColumn = f.mode === 'column';
    const steps = [];

    if (s.dilute && f.water > 0.005) {
      steps.push('Разбавить сырец до ' + nf(s.diluteTo, 0) + ' %: влить ' + L(f.water) + ' л воды, получится ' + L(f.chargeVolume) + ' л заряда.');
    } else if (s.dilute) {
      steps.push('Разбавлять не нужно: сырец уже ' + nf(s.ssAbv, 1) + ' %.');
    } else {
      steps.push('Залить сырец как есть: ' + L1(s.ssVol) + ' л ' + nf(s.ssAbv, 1) + ' %.');
    }

    if (isColumn) {
      steps.push('Дать колонне выйти на режим — 15–20 минут на себя, затем отбор голов капельно: ' + ML(f.headsVolume * 1000) + ' мл (' + nf(s.headsPct, 1) + ' % от АС).');
      steps.push('Сменить ёмкость: тело на ' + strengthTxt(f.bodyAbv) + ' % до падения крепости в струе ниже ' + nf(f.stopAbv, 1) + ' % — ориентир ' + L(f.bodyVolume) + ' л.');
      steps.push('Хвосты (' + L(f.tailsAlcohol) + ' л АС ≈ ' + L(f.tailsVolume) + ' л при ' + strengthTxt(f.tailsStrength) + ' %) — отдельно, в следующий куб или на повторную ректификацию.');
      steps.push('Разбавить ректификат до питьевой крепости: выйдет ' + L(f.drink40) + ' л при 40 %.');
    } else {
      steps.push('Отобрать головы — ' + ML(f.headsVolume * 1000) + ' мл, капельно, это ' + nf(s.headsPct, 1) + ' % от АС.');
      steps.push('Сменить ёмкость: тело — до ' + nf(s.stopAbv, 0) + ' % в струе, ориентир ' + L(f.bodyVolume) + ' л при ' + strengthTxt(f.bodyAbv) + ' %.');
      steps.push('Хвосты (' + L(f.tailsAlcohol) + ' л АС) — отдельно, в следующий куб.');
      steps.push('Тело разбавить до питьевой крепости: выйдет ' + L(f.drink40) + ' л при 40 %.');
    }

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
        if (state.headsAuto) {
          state.headsPct = Calc.headsDefault(state.mode, state.raw);
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

  // Рабочие значения под аппарат: у колонны заряд крепче и стоп выше.
  function applyModeDefaults() {
    const isColumn = state.mode === 'column';
    state.stopAbv = isColumn ? 95 : 40;
    state.diluteTo = isColumn ? 35 : 20;
    // ручные головы не трогаем — только автонорму
    if (state.headsAuto) state.headsPct = Calc.headsDefault(state.mode, state.raw);
  }

  function setMode(mode) {
    if (!Calc.MODES[mode] || mode === state.mode) return;

    state.mode = mode;
    applyModeDefaults();

    applyStateToInputs();
    render();
    save();
    toasts(mode === 'column' ? 'Колонна: тело 96,6 % об.' : 'Дистиллятор: тело 60–70 % об.');
  }

  function wireMode() {
    $$('#deviceMode .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
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
    const isColumn = f.mode === 'column';
    const lines = [
      (isColumn ? 'Ректификация — расчёт' : 'Дробная перегонка — расчёт'),
      'Сырец: ' + L1(s.ssVol) + ' л, ' + nf(s.ssAbv, 1) + ' % об. → ' + L(f.alcohol) + ' л АС',
      s.dilute && f.water > 0.005
        ? 'Разбавление до ' + nf(s.diluteTo, 0) + ' %: +' + L(f.water) + ' л воды, заряд ' + L(f.chargeVolume) + ' л'
        : 'Без разбавления',
      'Головы: ' + ML(f.headsVolume * 1000) + ' мл (' + nf(s.headsPct, 1) + ' % от АС, ≈' + strengthTxt(f.headsStrength) + ' % об.)',
      'Тело: ' + L(f.bodyVolume) + ' л при ' + strengthTxt(f.bodyAbv) + ' % об. (' + L(f.bodyAlcohol) + ' л АС), отбор до ' + nf(f.stopAbv, 1) + ' % в струе',
      'Хвосты: ' + L(f.tailsAlcohol) + ' л АС (≈' + L(f.tailsVolume) + ' л при ' + strengthTxt(f.tailsStrength) + ' %)',
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

  // Ссылку можно дать сразу с нужным аппаратом: index.html?mode=still
  try {
    const urlMode = new URLSearchParams(window.location.search).get('mode');
    if (urlMode && Calc.MODES[urlMode]) {
      state.mode = urlMode;
      applyModeDefaults();
    }
  } catch (err) {
    /* старый браузер без URLSearchParams — просто открываем как есть */
  }

  applyStateToInputs();
  wireInputs();
  wireChips();
  wireMode();
  wireWashMode();
  wireTabs();
  wireCopy();
  wireReset();
  render();
  activateTab(initialTab(), false);
})();
