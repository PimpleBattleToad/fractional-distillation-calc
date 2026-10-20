'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../calc.js');

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `ожидалось ${expected}, получено ${actual}`);

test('clamp держит значение в границах', () => {
  assert.equal(Calc.clamp(5, 0, 10), 5);
  assert.equal(Calc.clamp(-3, 0, 10), 0);
  assert.equal(Calc.clamp(42, 0, 10), 10);
});

test('num понимает запятую и подставляет fallback', () => {
  assert.equal(Calc.num('30,5'), 30.5);
  assert.equal(Calc.num('30.5'), 30.5);
  assert.equal(Calc.num(12), 12);
  assert.equal(Calc.num('', 7), 7);
  assert.equal(Calc.num('abc', 3), 3);
  assert.equal(Calc.num(null, 4), 4);
});

test('tailsShare растёт с крепостью отбора и ограничен 5–30 %', () => {
  close(Calc.tailsShare(40), 0.15);
  close(Calc.tailsShare(10), 0.05); // 0 → обрезано снизу
  close(Calc.tailsShare(90), 0.30); // 0.40 → обрезано сверху
});

test('fractions: базовый расчёт 8 л × 30 %', () => {
  const f = Calc.fractions({ ssVol: 8, ssAbv: 30, dilute: true, diluteTo: 20, headsPct: 8, stopAbv: 40, bodyAbv: 62 });

  close(f.alcohol, 2.4);
  close(f.water, 4); // 8 × (30/20 − 1)
  close(f.chargeVolume, 12);
  close(f.chargeAbv, 20);

  close(f.headsFrac, 0.08);
  close(f.bodyFrac, 0.77);
  close(f.tailsFrac, 0.15);

  close(f.headsAlcohol, 0.192);
  close(f.headsVolume, 0.192 / 0.88);
  close(f.tailsAlcohol, 0.36);
  close(f.tailsVolume, 1.8);
  close(f.bodyAlcohol, 1.848);
  close(f.bodyVolume, 1.848 / 0.62);
  close(f.drink40, 4.62);
});

test('fractions: фракции складываются в целое и в объём спирта', () => {
  const f = Calc.fractions({ ssVol: 12, ssAbv: 42, dilute: false, headsPct: 12, stopAbv: 55, bodyAbv: 70 });
  close(f.headsFrac + f.bodyFrac + f.tailsFrac, 1);
  close(f.headsAlcohol + f.bodyAlcohol + f.tailsAlcohol, f.alcohol);
  assert.ok(f.bodyFrac > 0);
});

test('fractions: без разбавления заряд равен исходному объёму', () => {
  const f = Calc.fractions({ ssVol: 10, ssAbv: 45, dilute: false, diluteTo: 20, headsPct: 8, stopAbv: 40, bodyAbv: 62 });
  close(f.water, 0);
  close(f.chargeVolume, 10);
  close(f.chargeAbv, 45);
});

test('fractions: не разбавляет, если крепость не выше целевой', () => {
  const f = Calc.fractions({ ssVol: 10, ssAbv: 20, dilute: true, diluteTo: 20, headsPct: 8, stopAbv: 40, bodyAbv: 62 });
  close(f.water, 0);
  close(f.chargeVolume, 10);
});

test('fractions: экстремальные головы не дают отрицательного тела', () => {
  const f = Calc.fractions({ ssVol: 5, ssAbv: 30, dilute: true, diluteTo: 20, headsPct: 40, stopAbv: 90, bodyAbv: 62 });
  close(f.tailsFrac, 0.30);
  assert.ok(f.bodyFrac >= 0);
});

test('fractions: пустой ввод не ломает расчёт', () => {
  const f = Calc.fractions({});
  close(f.alcohol, 0);
  close(f.headsVolume, 0);
  close(f.bodyVolume, 0);
  close(f.drink40, 0);
});

test('fromWash: 20 л браги 12 % даёт 8 л сырца 30 %', () => {
  const r = Calc.fromWash({ volume: 20, abv: 12 });
  close(r.alcohol, 2.4);
  close(r.ssVolume, 8);
  assert.equal(r.ssStrength, 30);
});

test('fromWash: крепость браги ограничена 20 %', () => {
  const r = Calc.fromWash({ volume: 10, abv: 35 });
  close(r.washAbv, 20);
  close(r.alcohol, 2);
});

test('fromSugar: 5 кг сахара, гидромодуль 5', () => {
  const r = Calc.fromSugar({ kg: 5, hydro: 5, raw: 'sugar' });
  close(r.water, 25);
  close(r.washVolume, 28); // 25 + 5 × 0.6
  close(r.alcohol, 3);     // 5 × 0.60
  close(r.washAbv, (3 / 28) * 100);
  close(r.ssVolume, 10);
});

test('fromSugar: гидромодуль обрезается до 2–8, выход зависит от сырья', () => {
  const r = Calc.fromSugar({ kg: 4, hydro: 1, raw: 'fruit' });
  close(r.hydro, 2);
  close(r.water, 8);
  close(r.alcohol, 2); // 4 × 0.50
  close(Calc.fromSugar({ kg: 1, hydro: 5, raw: 'grain' }).alcohol, 0.55);
  close(Calc.fromSugar({ kg: 1, hydro: 5, raw: 'grape' }).alcohol, 0.58);
});

test('fromSugar: неизвестное сырьё считается сахарным', () => {
  const r = Calc.fromSugar({ kg: 1, hydro: 5, raw: 'нет-такого' });
  close(r.alcohol, 0.60);
  assert.equal(r.type.id, 'sugar');
});

test('dilute: 5 л 65 % до 40 %', () => {
  const r = Calc.dilute({ volume: 5, abv: 65, target: 40 });
  close(r.alcohol, 3.25);
  close(r.total, 8.125);
  close(r.water, 3.125);
  close(r.perLiter, 0.625);
  assert.equal(r.possible, true);
});

test('dilute: нельзя «разбавить» до крепости выше исходной', () => {
  const r = Calc.dilute({ volume: 5, abv: 30, target: 40 });
  assert.equal(r.possible, false);
  close(r.water, 0);
  close(r.total, 3.75);
});

test('dilute: нулевой объём не даёт деления на ноль', () => {
  const r = Calc.dilute({ volume: 0, abv: 60, target: 40 });
  close(r.perLiter, 0);
  close(r.water, 0);
});

test('correctReading: при 20 °C поправка нулевая', () => {
  const r = Calc.correctReading({ reading: 40, tempC: 20 });
  close(r.corrected, 40);
  close(r.delta, 0);
  close(r.coefficient, 0.4 - 0.0012 * 40);
});

test('correctReading: тёплый раствор показывает завышенную крепость', () => {
  const r = Calc.correctReading({ reading: 40, tempC: 25 });
  close(r.corrected, 40 - 0.352 * 5);
  close(r.delta, -1.76);
  assert.ok(r.corrected < 40);
});

test('correctReading: холодный раствор — поправка вверх, границы соблюдены', () => {
  const r = Calc.correctReading({ reading: 30, tempC: 10 });
  assert.ok(r.corrected > 30);
  close(r.corrected, 30 + (0.4 - 0.0012 * 30) * 10);

  const low = Calc.correctReading({ reading: 5, tempC: 10 });
  assert.ok(low.corrected >= 0 && low.corrected <= 96);
});

test('справочник сырья содержит все четыре типа', () => {
  assert.deepEqual(Object.keys(Calc.RAW_TYPES).sort(), ['fruit', 'grain', 'grape', 'sugar']);
  for (const type of Object.values(Calc.RAW_TYPES)) {
    assert.ok(type.headsMin <= type.heads && type.heads <= type.headsMax);
    assert.ok(type.headsMin > 0 && type.headsMax < 40);
    assert.ok(typeof type.labelGen === 'string' && type.labelGen.length > 0);
    // у колонны голов в разы меньше
    assert.ok(type.recHeadsMin <= type.recHeads && type.recHeads <= type.recHeadsMax);
    assert.ok(type.recHeads < type.heads);
  }
});

/* ---------- ректификационная колонна ---------- */

test('tailsShare: у колонны хвостов больше при низком стопе', () => {
  close(Calc.tailsShare(95, 'column'), 0.02);
  close(Calc.tailsShare(92, 'column'), 0.05);
  close(Calc.tailsShare(88, 'column'), 0.09);
  close(Calc.tailsShare(80, 'column'), 0.12); // обрезано сверху
  close(Calc.tailsShare(60, 'column'), 0.12);
  // дистиллятор не изменился
  close(Calc.tailsShare(95, 'still'), 0.30);
});

test('headsDefault: колонне достаётся меньшая доля голов', () => {
  assert.equal(Calc.headsDefault('still', 'sugar'), 8);
  assert.equal(Calc.headsDefault('column', 'sugar'), 3);
  assert.equal(Calc.headsDefault('column', 'grape'), 5);
  assert.equal(Calc.headsDefault('column', 'нет-такого'), 3);
});

test('fractions в режиме колонны считает ректификат 96,6 %', () => {
  const f = Calc.fractions({ mode: 'column', ssVol: 8, ssAbv: 30, dilute: false, headsPct: 3, stopAbv: 95 });

  assert.equal(f.mode, 'column');
  close(f.alcohol, 2.4);
  close(f.headsFrac, 0.03);
  close(f.tailsFrac, 0.02);
  close(f.bodyFrac, 0.95);

  // крепости фиксированы режимом
  close(f.bodyAbv, 96.6);
  close(f.headsStrength, 96.6);
  close(f.tailsStrength, 96);

  close(f.headsAlcohol, 0.072);
  close(f.headsVolume, 0.072 / 0.966);
  close(f.tailsAlcohol, 0.048);
  close(f.tailsVolume, 0.05);
  close(f.bodyAlcohol, 2.28);
  close(f.bodyVolume, 2.28 / 0.966);
  close(f.drink40, 5.7);

  // сумма фракций сходится к объёму спирта
  close(f.headsAlcohol + f.bodyAlcohol + f.tailsAlcohol, f.alcohol);
});

test('режим колонны игнорирует ручную крепость тела', () => {
  const f = Calc.fractions({ mode: 'column', ssVol: 8, ssAbv: 30, bodyAbv: 62, stopAbv: 95, headsPct: 3 });
  close(f.bodyAbv, 96.6);
  // а в дистилляторе та же настройка работает
  const g = Calc.fractions({ mode: 'still', ssVol: 8, ssAbv: 30, bodyAbv: 62, stopAbv: 95, headsPct: 3 });
  close(g.bodyAbv, 62);
});

test('разбавление ректификата 96,6 % до 40 %', () => {
  const d = Calc.dilute({ volume: 2.28, abv: 96.6, target: 40 });
  assert.equal(d.possible, true);
  close(d.water, (2.28 * 0.966) / 0.4 - 2.28);
  close(d.total, (2.28 * 0.966) / 0.4);
});

test('ареометр принимает крепость ректификата', () => {
  const r = Calc.correctReading({ reading: 96.6, tempC: 20 });
  close(r.corrected, 96.6);
  const warm = Calc.correctReading({ reading: 96.6, tempC: 25 });
  assert.ok(warm.corrected < 96.6 && warm.corrected > 90);
});
