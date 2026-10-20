'use strict';

/*
 * Интеграционный тест интерфейса: app.js целиком исполняется в поддельном DOM,
 * поэтому проверяются реальные строки, которые видит пользователь.
 * DOM-заглушка намеренно минимальна — только то, что использует app.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function createDom() {
  const byId = new Map();
  const writes = new Map();
  const steps = [];
  const listeners = new Map();
  const storage = new Map();

  function makeEl(id) {
    const el = {
      id: id,
      type: 'number',
      value: '',
      checked: false,
      hidden: false,
      open: false,
      tabIndex: 0,
      min: '',
      max: '',
      innerHTML: '',
      dataset: {},
      children: [],
      style: {
        setProperty() {},
        getPropertyValue: () => ''
      },
      classList: {
        _set: new Set(),
        toggle(cls, on) {
          if (on === undefined) on = !this._set.has(cls);
          if (on) this._set.add(cls);
          else this._set.delete(cls);
        },
        add(cls) {
          this._set.add(cls);
        },
        remove(cls) {
          this._set.delete(cls);
        },
        contains(cls) {
          return this._set.has(cls);
        }
      },
      addEventListener(type, fn) {
        if (!listeners.has(el)) listeners.set(el, new Map());
        const map = listeners.get(el);
        if (!map.has(type)) map.set(type, []);
        map.get(type).push(fn);
      },
      appendChild(child) {
        el.children.push(child);
        if (el.id === 'stepsList') steps.push(child.textContent || '');
        return child;
      },
      removeChild(child) {
        el.children = el.children.filter((c) => c !== child);
      },
      setAttribute() {},
      select() {},
      focus() {}
    };

    Object.defineProperty(el, 'textContent', {
      get() {
        return el._text || '';
      },
      set(v) {
        el._text = String(v);
        writes.set(id, String(v));
      }
    });

    Object.defineProperty(el, 'style', {
      get() {
        return el._style;
      },
      set(v) {
        el._style = v;
      }
    });
    el._style = {
      setProperty() {},
      width: ''
    };

    return el;
  }

  const fieldElements = new Map();
  function field(key) {
    if (!fieldElements.has(key)) {
      const el = makeEl(key + 'Field');
      el.dataset.key = key;
      el.type = key === 'dilute' ? 'checkbox' : 'number';
      el.min = '0';
      el.max = '100';
      fieldElements.set(key, el);
    }
    return fieldElements.get(key);
  }

  const chips = [];
  function chip(data, cls) {
    const name = Object.values(data).join('-');
    const el = makeEl(cls + '-' + name);
    el.dataset = data;
    el.className = cls;
    chips.push(el);
    return el;
  }

  // Состав списков берём из реальной разметки, чтобы заглушка не расходилась с index.html.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uniq = (re) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];

  const dataKeys = uniq(/data-key="([^"]+)"/g);
  const rawChips = uniq(/data-raw="([^"]+)"/g).map((r) => chip({ raw: r }, 'chip'));
  const dilChips = uniq(/data-dilute="([^"]+)"/g).map((d) => chip({ dilute: d }, 'chip'));
  const washChips = uniq(/data-washmode="([^"]+)"/g).map((w) => chip({ washmode: w }, 'seg-btn'));
  const tabChips = uniq(/data-tab="([^"]+)"/g).map((t) => chip({ tab: t }, 'tab'));
  const panelChips = uniq(/data-tab="([^"]+)"/g).map((t) => {
    const el = chip({ tab: t }, 'panel');
    el.id = 'panel-' + t;
    return el;
  });

  const document = {
    activeElement: null,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeEl(id));
      return byId.get(id);
    },
    querySelectorAll(selector) {
      const key = /^\[data-key="([^"]+)"\]$/.exec(selector);
      if (key) return [field(key[1])];
      if (selector === '[data-key]') return dataKeys.map(field);
      const range = /^input\[type="range"\]\[data-key="([^"]+)"\]$/.exec(selector);
      if (range) return [field(range[1])];
      if (selector === '#rawChips .chip') return rawChips;
      if (selector === '#dilChips .chip') return dilChips;
      if (selector === '#washMode .seg-btn') return washChips;
      if (selector === '.tab') return tabChips;
      if (selector === '.panel') return panelChips;
      return [];
    },
    createElement(tag) {
      return makeEl(tag);
    },
    body: { appendChild() {}, removeChild() {} }
  };

  const window = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    location: { hash: '', search: '' },
    history: { replaceState() {} },
    addEventListener() {},
    setTimeout: (fn) => 0,
    clearTimeout() {},
    isSecureContext: false
  };
  window.window = window;
  window.document = document;

  return { window, document, writes, steps, listeners, storage, fieldElements, chips, byId };
}

function boot() {
  const dom = createDom();

  // calc.js выполняется отдельно: ядро не зависит от DOM, берём его результат.
  const calcSource = fs.readFileSync(path.join(root, 'calc.js'), 'utf8');
  const Calc = vm.runInNewContext(calcSource + '\n;typeof Calc === "undefined" ? null : Calc;', {});
  assert.ok(Calc && typeof Calc.fractions === 'function', 'calc.js должен публиковать Calc');

  const sandbox = {
    document: dom.document,
    navigator: {},
    console,
    setTimeout: (fn) => 0,
    clearTimeout() {},
    URLSearchParams,
    Calc: Calc,
    localStorage: dom.window.localStorage,
    location: dom.window.location,
    history: dom.window.history,
    addEventListener() {},
    isSecureContext: false
  };
  // В браузере window === globalThis; повторяем это, чтобы app.js видел window.Calc.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  vm.runInNewContext(appSource, sandbox, { filename: 'app.js' });

  dom.window.document = dom.document;
  return dom;
}

const text = (dom, id) => dom.writes.get(id);

test('app.js исполняется без ошибок и заполняет результат', () => {
  const dom = boot();

  assert.equal(text(dom, 'acValue'), '2,40');
  assert.equal(text(dom, 'headsVol'), '218');
  assert.equal(text(dom, 'bodyVol'), '2,98');
  assert.equal(text(dom, 'tailsVol'), '0,36');
  assert.equal(text(dom, 'drink40'), '4,62 л');
});

test('подписи фракций согласованы с числами', () => {
  const dom = boot();

  assert.equal(text(dom, 'headsSub'), '0,19 л АС · 8 %');
  assert.equal(text(dom, 'bodySub'), '1,85 л АС · 62 %');
  assert.equal(text(dom, 'tailsSub'), '≈1,80 л при 20 %');
  assert.match(text(dom, 'headsHint'), /Для сахарной браги норма — 8–10 % от АС/);
  assert.match(text(dom, 'acHint'), /8,0 л × 30,0 % = 2,40 л АС/);
});

test('полоса фракций получает проценты ширины', () => {
  const dom = boot();
  assert.equal(dom.document.getElementById('segHeads').style.width, '8.00%');
  assert.equal(dom.document.getElementById('segBody').style.width, '77.00%');
  assert.equal(dom.document.getElementById('segTails').style.width, '15.00%');
});

test('план перегонки состоит из пяти шагов', () => {
  const dom = boot();
  assert.equal(dom.steps.length, 5);
  assert.match(dom.steps[0], /влить 4,00 л воды/);
  assert.match(dom.steps[1], /218 мл/);
  assert.match(dom.steps[4], /4,62 л при 40 %/);
});

test('вкладка разбавления считает воду и поправку', () => {
  const dom = boot();
  assert.equal(text(dom, 'dilWater'), '3,13');
  assert.equal(text(dom, 'dilTotal'), '8,13 л');
  assert.equal(text(dom, 'dilPerLiter'), '0,63 л');
  assert.equal(text(dom, 'tempOut'), '38,2');
  assert.equal(text(dom, 'tempDelta'), '−1,8 %');
  assert.equal(text(dom, 'tempK'), '0,35 %/°C');
});

test('блок «сырец из браги» считает по объёму', () => {
  const dom = boot();
  assert.equal(text(dom, 'washAc'), '2,40 л');
  assert.equal(text(dom, 'washSs'), '8,0 л');
});

test('изменение объёма сырца пересчитывает всё', () => {
  const dom = boot();
  const el = dom.fieldElements.get('ssVol');
  assert.ok(el, 'поле ssVol должно быть связано обработчиком');
  el.value = '16';
  el.addEventListener; // обработчики уже навешаны при загрузке
  const handlers = dom.listeners.get(el).get('input');
  handlers.forEach((fn) => fn());

  assert.equal(text(dom, 'acValue'), '4,80');
  assert.equal(text(dom, 'headsVol'), '436');
  assert.equal(text(dom, 'drink40'), '9,24 л');
});

test('отключение разбавления убирает воду из заряда', () => {
  const dom = boot();
  const el = dom.fieldElements.get('dilute');
  el.checked = false;
  dom.steps.length = 0;
  dom.listeners.get(el).get('input').forEach((fn) => fn());

  assert.match(text(dom, 'diluteHint'), /Без разбавления/);
  assert.match(dom.steps[0], /Залить сырец как есть: 8,0 л 30,0 %/);
});

test('смена сырья меняет норму голов, если она не задана вручную', () => {
  const dom = boot();
  const grape = dom.chips.find((c) => c.dataset.raw === 'grape');
  dom.listeners.get(grape).get('click').forEach((fn) => fn());

  assert.equal(dom.fieldElements.get('headsPct').value, 12);
  assert.match(text(dom, 'headsHint'), /Для виноградной браги/);
  assert.equal(text(dom, 'headsSub'), '0,29 л АС · 12 %');
});

test('состояние сохраняется в localStorage', () => {
  const dom = boot();
  const el = dom.fieldElements.get('ssVol');
  el.value = '10';
  dom.listeners.get(el).get('input').forEach((fn) => fn());

  const saved = JSON.parse(dom.storage.get('fractional-distillation-calc/v1'));
  assert.equal(saved.ssVol, 10);
  assert.equal(saved.raw, 'sugar');
  assert.equal(saved.headsAuto, true);
});

test('переключение режима браги меняет панели', () => {
  const dom = boot();
  const sugarBtn = dom.chips.find((c) => c.dataset.washmode === 'sugar');
  dom.listeners.get(sugarBtn).get('click').forEach((fn) => fn());

  assert.equal(dom.document.getElementById('paneSugar').hidden, false);
  assert.equal(dom.document.getElementById('paneVol').hidden, true);
  assert.equal(text(dom, 'washSs'), '10,0 л'); // 5 кг сахара → 3 л АС → 10 л сырца
});

test('липкая строка показывает главное число вкладки', () => {
  const dom = boot();
  const bar = dom.document.getElementById('stickyBar');

  // перегонка: сколько абсолютного спирта и сколько выйдет напитка
  assert.equal(bar.hidden, false);
  assert.equal(text(dom, 'sbVal'), '2,40 л АС');
  assert.match(text(dom, 'sbLab'), /напитка 40 %: 4,62 л/);

  // разбавление: сколько воды долить
  const diluteTab = dom.chips.find((c) => c.className === 'tab' && c.dataset.tab === 'dilute');
  dom.listeners.get(diluteTab).get('click').forEach((fn) => fn());
  assert.equal(bar.hidden, false);
  assert.equal(text(dom, 'sbVal'), '3,13 л воды');
  assert.match(text(dom, 'sbLab'), /Всего 8,13 л при 40 %/);

  // методика: показывать нечего, строка прячется
  const guideTab = dom.chips.find((c) => c.className === 'tab' && c.dataset.tab === 'guide');
  dom.listeners.get(guideTab).get('click').forEach((fn) => fn());
  assert.equal(bar.hidden, true);
});

test('если разбавлять не нужно, липкая строка говорит об этом', () => {
  const dom = boot();
  const el = dom.fieldElements.get('dilAbv');
  el.value = '30';
  dom.listeners.get(el).get('input').forEach((fn) => fn());

  const diluteTab = dom.chips.find((c) => c.className === 'tab' && c.dataset.tab === 'dilute');
  dom.listeners.get(diluteTab).get('click').forEach((fn) => fn());

  assert.equal(text(dom, 'sbVal'), 'Разбавлять не нужно');
  assert.match(text(dom, 'sbLab'), /30,0 % уже не выше 40 %/);
});
