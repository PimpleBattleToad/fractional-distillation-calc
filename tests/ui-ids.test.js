'use strict';

/*
 * Структурный тест связки «интерфейс ↔ расчёт».
 * Проверяет, что все DOM-идентификаторы и ключи состояния, на которые
 * ссылается app.js, реально существуют в index.html, а справочники
 * интерфейса согласованы с calc.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Calc = require('../calc.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'pwa.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (m) => m[1]));
const unique = (items) => Array.from(new Set(items));

/** Идентификаторы, которые ищут app.js и pwa.js через $('...') и setTxt('...', ...). */
function referencedIds() {
  const ids = [];
  for (const src of [app, pwa]) {
    for (const m of src.matchAll(/\$\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) ids.push(m[1]);
    for (const m of src.matchAll(/setTxt\(\s*'([A-Za-z0-9_-]+)'/g)) ids.push(m[1]);
    for (const m of src.matchAll(/\$\$\('#([A-Za-z0-9_-]+)/g)) ids.push(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) ids.push(m[1]);
  }
  return unique(ids);
}

function defaultKeys() {
  const block = app.match(/const DEFAULTS = \{([\s\S]*?)\n {2}\};/);
  assert.ok(block, 'в app.js не найден объект DEFAULTS');
  return new Set(Array.from(block[1].matchAll(/^\s{4}([A-Za-z0-9_]+):/gm), (m) => m[1]));
}

test('index.html не содержит дубликатов id', () => {
  const all = Array.from(html.matchAll(/\bid="([^"]+)"/g), (m) => m[1]);
  const seen = new Set();
  const dup = [];
  for (const id of all) {
    if (seen.has(id)) dup.push(id);
    seen.add(id);
  }
  assert.deepEqual(dup, [], 'дублирующиеся id: ' + dup.join(', '));
});

test('каждый id из app.js присутствует в index.html', () => {
  const missing = referencedIds().filter((id) => !htmlIds.has(id));
  assert.deepEqual(missing, [], 'app.js ссылается на отсутствующие id: ' + missing.join(', '));
});

test('вкладки ведут на существующие панели', () => {
  const tabs = unique(Array.from(html.matchAll(/data-tab="([^"]+)"/g), (m) => m[1]));
  assert.ok(tabs.length >= 3, 'ожидались минимум три вкладки');
  for (const tab of tabs) {
    assert.ok(htmlIds.has('panel-' + tab), 'нет панели panel-' + tab);
  }
});

test('все поля с data-key описаны в DEFAULTS', () => {
  const keys = defaultKeys();
  const used = unique(Array.from(html.matchAll(/data-key="([^"]+)"/g), (m) => m[1]));
  const unknown = used.filter((key) => !keys.has(key));
  assert.deepEqual(unknown, [], 'data-key без значения в DEFAULTS: ' + unknown.join(', '));
});

test('у каждого числового поля есть согласованные min/max', () => {
  for (const m of html.matchAll(/<input[^>]*data-key="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    if (!/\btype="(?:number|range)"/.test(tag)) continue;
    const min = tag.match(/\bmin="([^"]+)"/);
    const max = tag.match(/\bmax="([^"]+)"/);
    assert.ok(min && max, 'у поля ' + m[1] + ' нет min/max');
    assert.ok(Number(min[1]) < Number(max[1]), 'min должен быть меньше max у ' + m[1]);
  }
});

test('чипы сырья соответствуют справочнику calc.js', () => {
  const raws = unique(Array.from(html.matchAll(/data-raw="([^"]+)"/g), (m) => m[1]));
  assert.ok(raws.length >= 4, 'ожидались четыре вида сырья');
  for (const raw of raws) assert.ok(Calc.RAW_TYPES[raw], 'неизвестный вид сырья: ' + raw);
});

test('чипы крепости разбавления числовые', () => {
  const values = unique(Array.from(html.matchAll(/data-dilute="([^"]+)"/g), (m) => m[1]));
  assert.ok(values.length >= 3);
  for (const value of values) {
    const n = Calc.num(value, NaN);
    assert.ok(Number.isFinite(n) && n > 0 && n <= 96, 'плохая крепость в чипе: ' + value);
  }
});

test('переключатель режима браги содержит обе панели', () => {
  const modes = unique(Array.from(html.matchAll(/data-washmode="([^"]+)"/g), (m) => m[1]));
  assert.deepEqual(modes.sort(), ['sugar', 'vol']);
  assert.ok(htmlIds.has('paneVol') && htmlIds.has('paneSugar'));
});

test('скрипты подключены в безопасном порядке', () => {
  const calcPos = html.indexOf('src="calc.js"');
  const appPos = html.indexOf('src="app.js"');
  const headEnd = html.indexOf('</head>');
  const toastPos = html.indexOf('id="toast"');
  assert.ok(calcPos > 0, 'calc.js не подключён');
  assert.ok(appPos > calcPos, 'app.js должен идти после calc.js');
  assert.ok(calcPos > headEnd, 'скрипты должны стоять в конце body, а не в head');
  assert.ok(calcPos > toastPos, 'скрипты должны идти после всей разметки интерфейса');
});

test('классы, на которые опирается JS, есть в стилях', () => {
  for (const cls of ['is-active', 'is-visible', 'is-tight', 'tab', 'panel', 'chip', 'seg-btn', 'frac', 'hero', 'sticky-bar', 'diag']) {
    assert.ok(css.includes('.' + cls), 'в styles.css нет правил для .' + cls);
  }
});

test('страница подключена к PWA-слою', () => {
  assert.ok(html.includes('rel="manifest" href="manifest.json"'), 'нет ссылки на manifest.json');
  assert.ok(html.includes('rel="icon"') && html.includes('icons/icon-192.png'), 'нет иконки 192');
  assert.ok(html.includes('apple-touch-icon') && html.includes('icons/icon-180.png'), 'нет apple-touch-icon');
  assert.ok(html.includes('mobile-web-app-capable'), 'нет mobile-web-app-capable');
  const appPos = html.indexOf('src="app.js"');
  const pwaPos = html.indexOf('src="pwa.js"');
  assert.ok(pwaPos > appPos && pwaPos > 0, 'pwa.js должен подключаться после app.js');

  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/);
  assert.ok(viewport, 'нет meta viewport');
  assert.ok(/width=device-width/.test(viewport[1]), 'viewport без width=device-width');
  assert.ok(/user-scalable=no/.test(viewport[1]), 'viewport должен запрещать зум пальцами');
  assert.ok(!/minimum-scale/.test(viewport[1]), 'minimum-scale мешает автоподгонке на телефоне');

  for (const id of ['stickyBar', 'sbVal', 'sbLab', 'sbBtn', 'diag']) {
    assert.ok(htmlIds.has(id), 'нет элемента #' + id);
  }
  assert.match(html, /id="stickyBar"[^>]*\bhidden\b/, 'липкая строка должна быть скрыта до рендера');
  assert.match(html, /id="diag"[^>]*\bhidden\b/, 'диагностика должна быть скрыта по умолчанию');
});

test('в разметке нет незакрытых ключевых секций', () => {
  assert.equal((html.match(/<section\b/g) || []).length, (html.match(/<\/section>/g) || []).length);
  assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length);
  assert.ok(html.startsWith('<!doctype html>') || html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('lang="ru"'));
  assert.ok(html.includes('charset="utf-8"') || html.includes('charset="UTF-8"'));
});
