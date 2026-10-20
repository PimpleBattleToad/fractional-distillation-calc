'use strict';

/*
 * Проверки PWA-слоя: manifest, сервис-воркер, иконки, сервер для телефона.
 * Никаких браузеров — только файлы и их структура.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (name) => fs.existsSync(path.join(root, name));

/** Ширина и высота PNG из заголовка IHDR — без сторонних библиотек. */
function pngSize(file) {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', file + ': это не PNG');
  assert.equal(buf.slice(12, 16).toString('ascii'), 'IHDR', file + ': нет заголовка IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const manifest = JSON.parse(read('manifest.json'));
const sw = read('sw.js');
const indexHtml = read('index.html');

test('manifest описывает устанавливаемое приложение', () => {
  assert.equal(manifest.name, 'Калькулятор дробной перегонки');
  assert.ok(manifest.short_name && manifest.short_name.length <= 12, 'short_name должен быть коротким');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.equal(manifest.theme_color, '#100e0c', 'цвет темы должен совпадать с фоном приложения');
});

test('в manifest есть иконки any и maskable нужных размеров', () => {
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), 'нет иконки 192x192');
  assert.ok(sizes.includes('512x512'), 'нет иконки 512x512');
  assert.ok(manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')), 'нет maskable-иконки');

  for (const icon of manifest.icons) {
    assert.ok(exists(icon.src.replace(/^\.\//, '')), 'в manifest указан отсутствующий файл: ' + icon.src);
    const [w, h] = icon.sizes.split('x').map(Number);
    const real = pngSize(icon.src.replace(/^\.\//, ''));
    assert.deepEqual([real.width, real.height], [w, h], 'размер ' + icon.src + ' не совпадает с manifest');
  }
});

test('apple-touch-icon и обычная иконка на месте', () => {
  for (const [file, size] of [['icons/icon-180.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512]]) {
    const real = pngSize(file);
    assert.equal(real.width, size, file + ': ширина');
    assert.equal(real.height, size, file + ': высота');
  }
});

test('сервис-воркер кэширует все файлы приложения', () => {
  const cacheName = sw.match(/(?:var|let|const)\s+CACHE\s*=\s*'([^']+)'/);
  assert.ok(cacheName, 'в sw.js нет константы CACHE');
  assert.match(cacheName[1], /^distill-v\d+$/, 'имя кэша должно содержать версию');

  const assetsBlock = sw.match(/(?:var|let|const)\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(assetsBlock, 'в sw.js нет списка ASSETS');
  const assets = Array.from(assetsBlock[1].matchAll(/'([^']+)'/g), (m) => m[1]);
  assert.ok(assets.includes('./index.html'), 'в ASSETS нет index.html');

  for (const file of ['index.html', 'styles.css', 'calc.js', 'app.js', 'pwa.js', 'manifest.json']) {
    assert.ok(assets.some((asset) => asset.replace(/^\.\//, '') === file), 'в ASSETS нет ' + file);
  }
  for (const asset of assets) {
    const clean = asset.replace(/^\.\//, '');
    if (clean === '') continue;
    assert.ok(exists(clean), 'в ASSETS указан отсутствующий файл: ' + asset);
  }

  assert.ok(sw.includes('skipWaiting'), 'sw.js должен активироваться сразу');
  assert.ok(sw.includes('clients.claim'), 'sw.js должен забирать открытые страницы');
  assert.match(sw, /\.mode\s*===\s*'navigate'/, 'страницы должны обрабатываться отдельно от ассетов');
});

test('pwa.js регистрирует воркер только на защищённом источнике', () => {
  const pwa = read('pwa.js');
  assert.ok(pwa.includes('serviceWorker'), 'pwa.js не регистрирует сервис-воркер');
  assert.ok(/https:|localhost|127\.0\.0\.1/.test(pwa), 'регистрация должна проверять протокол');

  // file:// не даёт service worker — приложение обязано работать и без него
  const withoutSw = indexHtml.replace('<script src="pwa.js"></script>', '');
  assert.ok(withoutSw.includes('src="app.js"'), 'калькулятор не должен зависеть от pwa.js');
});

test('кэш не мешает обновлению интерфейса', () => {
  assert.match(sw, /caches\s*\.\s*keys\s*\(/, 'sw.js не перечисляет кэши');
  assert.match(sw, /caches\s*\.\s*delete\s*\(/, 'sw.js не удаляет устаревшие кэши');
});

test('сервер для телефона на месте и слушает сеть', () => {
  assert.ok(exists('serve-lan.js'), 'нет serve-lan.js');
  assert.ok(exists('serve-lan.ps1'), 'нет serve-lan.ps1');
  assert.ok(exists('serve-lan.cmd'), 'нет serve-lan.cmd');

  const server = read('serve-lan.js');
  assert.ok(server.includes('0.0.0.0'), 'сервер должен слушать 0.0.0.0, иначе телефон не подключится');
  assert.ok(server.includes('index.html'), 'сервер должен отдавать index.html');
  assert.ok(server.includes('..'), 'нет защиты от выхода за пределы папки');
});

test('сборка архива для хостинга существует и кладёт файлы в корень', () => {
  assert.ok(exists('tools/make-zip.ps1'), 'нет tools/make-zip.ps1');
  const zip = read('tools/make-zip.ps1');
  assert.ok(zip.includes('System.IO.Compression'), 'архив должен собираться через System.IO.Compression');
  assert.ok(zip.includes("Replace('\\', '/')"), 'пути в архиве должны быть с прямыми слэшами');
  for (const file of ["'index.html'", "'app.js'", "'sw.js'", "'manifest.json'", "'pwa.js'"]) {
    assert.ok(zip.includes(file), 'в архив не попадает ' + file);
  }
});

test('иконки рисуются локально, без внешних картинок', () => {
  assert.ok(exists('tools/make-icons.py'), 'нет tools/make-icons.py');
  const py = read('tools/make-icons.py');
  assert.ok(py.includes('numpy') && py.includes('PIL'), 'генератор иконок должен работать на numpy + PIL');
  assert.ok(!/https?:\/\//.test(py), 'генератор иконок не должен тянуть что-то из сети');
});
