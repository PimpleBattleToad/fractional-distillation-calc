/*!
 * Калькулятор дробной перегонки — расчётное ядро.
 * Чистые функции без DOM: работают в браузере (window.Calc) и в тестах (Node).
 */
(function (global) {
  'use strict';

  /* Справочник сырья: практический выход АС с 1 кг сахара и доля голов. */
  const RAW_TYPES = {
    sugar: { id: 'sugar', label: 'Сахарная', labelGen: 'сахарной', yieldPerKg: 0.60, heads: 8, headsMin: 8, headsMax: 10 },
    grain: { id: 'grain', label: 'Зерновая', labelGen: 'зерновой', yieldPerKg: 0.55, heads: 10, headsMin: 8, headsMax: 12 },
    fruit: { id: 'fruit', label: 'Фруктовая', labelGen: 'фруктовой', yieldPerKg: 0.50, heads: 12, headsMin: 10, headsMax: 15 },
    grape: { id: 'grape', label: 'Виноградная', labelGen: 'виноградной', yieldPerKg: 0.58, heads: 12, headsMin: 10, headsMax: 15 }
  };

  const HEADS_STRENGTH = 88;          // % об. — средняя крепость голов
  const TAILS_STRENGTH = 20;          // % об. — средняя крепость хвостов
  const SS_STRENGTH = 30;             // % об. — типичная крепость спирта-сырца
  const BODY_STRENGTH_DEFAULT = 62;   // % об. — средняя крепость тела
  const SUGAR_VOLUME_PER_KG = 0.6;    // л — объём, который занимает 1 кг сахара в растворе

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function num(value, fallback) {
    const raw = value == null ? '' : String(value).replace(',', '.');
    const parsed = typeof value === 'number' ? value : parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
    return fallback === undefined ? 0 : fallback;
  }

  /* Чем выше крепость, на которой остановлен отбор тела, тем больше спирта остаётся в хвостах. */
  function tailsShare(stopAbv) {
    return clamp(0.005 * num(stopAbv, 40) - 0.05, 0.05, 0.30);
  }

  /**
   * Основной расчёт дробной перегонки спирта-сырца.
   * input: { ssVol, ssAbv, dilute, diluteTo, headsPct, stopAbv, bodyAbv }
   */
  function fractions(input) {
    const src = input || {};
    const ssVol = Math.max(0, num(src.ssVol, 0));
    const ssAbv = clamp(num(src.ssAbv, 0), 0, 96);
    const diluteTo = clamp(num(src.diluteTo, 20), 5, 96);
    const headsPct = clamp(num(src.headsPct, 8), 0, 40);
    const stopAbv = clamp(num(src.stopAbv, 40), 5, 95);
    const bodyAbv = clamp(num(src.bodyAbv, BODY_STRENGTH_DEFAULT), 10, 96);
    const dilute = Boolean(src.dilute);

    const alcohol = (ssVol * ssAbv) / 100;
    const water = dilute && ssAbv > diluteTo ? ssVol * (ssAbv / diluteTo - 1) : 0;
    const chargeVolume = ssVol + water;

    const headsFrac = headsPct / 100;
    const tailsFrac = tailsShare(stopAbv);
    const bodyFrac = Math.max(0, 1 - headsFrac - tailsFrac);

    const headsAlcohol = alcohol * headsFrac;
    const tailsAlcohol = alcohol * tailsFrac;
    const bodyAlcohol = alcohol * bodyFrac;

    return {
      alcohol: alcohol,
      water: water,
      chargeVolume: chargeVolume,
      chargeAbv: chargeVolume > 0 ? (alcohol / chargeVolume) * 100 : 0,
      headsFrac: headsFrac,
      bodyFrac: bodyFrac,
      tailsFrac: tailsFrac,
      headsAlcohol: headsAlcohol,
      headsVolume: headsAlcohol / (HEADS_STRENGTH / 100),
      tailsAlcohol: tailsAlcohol,
      tailsVolume: tailsAlcohol / (TAILS_STRENGTH / 100),
      bodyAlcohol: bodyAlcohol,
      bodyVolume: bodyAlcohol / (bodyAbv / 100),
      bodyAbv: bodyAbv,
      drink40: bodyAlcohol / 0.4,
      headsStrength: HEADS_STRENGTH,
      tailsStrength: TAILS_STRENGTH
    };
  }

  /** Первая перегонка: брага → спирт-сырец. input: { volume, abv } */
  function fromWash(input) {
    const src = input || {};
    const volume = Math.max(0, num(src.volume, 0));
    const abv = clamp(num(src.abv, 0), 0, 20);
    const alcohol = (volume * abv) / 100;
    return {
      washVolume: volume,
      washAbv: abv,
      alcohol: alcohol,
      ssVolume: alcohol / (SS_STRENGTH / 100),
      ssStrength: SS_STRENGTH
    };
  }

  /** Сахарная брага. input: { kg, hydro, raw } */
  function fromSugar(input) {
    const src = input || {};
    const type = RAW_TYPES[src.raw] || RAW_TYPES.sugar;
    const kg = Math.max(0, num(src.kg, 0));
    const hydro = clamp(num(src.hydro, 5), 2, 8);

    const water = kg * hydro;
    const washVolume = water + kg * SUGAR_VOLUME_PER_KG;
    const alcohol = kg * type.yieldPerKg;

    return {
      sugarKg: kg,
      hydro: hydro,
      type: type,
      water: water,
      washVolume: washVolume,
      alcohol: alcohol,
      washAbv: washVolume > 0 ? (alcohol / washVolume) * 100 : 0,
      ssVolume: alcohol / (SS_STRENGTH / 100),
      ssStrength: SS_STRENGTH
    };
  }

  /** Разбавление спирта водой. input: { volume, abv, target } */
  function dilute(input) {
    const src = input || {};
    const volume = Math.max(0, num(src.volume, 0));
    const abv = clamp(num(src.abv, 0), 0, 96);
    const target = clamp(num(src.target, 40), 1, 96);
    const alcohol = (volume * abv) / 100;
    const total = alcohol / (target / 100);
    const water = Math.max(0, total - volume);
    return {
      alcohol: alcohol,
      water: water,
      total: total,
      perLiter: volume > 0 ? water / volume : 0,
      possible: abv > target,
      target: target
    };
  }

  /**
   * Поправка показаний ареометра к 20 °C.
   * Оценочная линейная модель: при нагреве раствор разрежается,
   * ареометр тонет глубже и показывает завышенную крепость.
   */
  function correctReading(input) {
    const src = input || {};
    const reading = clamp(num(src.reading, 0), 0, 96);
    const tempC = clamp(num(src.tempC, 20), 0, 40);
    const k = clamp(0.4 - 0.0012 * reading, 0.15, 0.45);
    const corrected = clamp(reading - k * (tempC - 20), 0, 96);
    return {
      corrected: corrected,
      delta: corrected - reading,
      coefficient: k,
      tempC: tempC
    };
  }

  const api = {
    RAW_TYPES: RAW_TYPES,
    HEADS_STRENGTH: HEADS_STRENGTH,
    TAILS_STRENGTH: TAILS_STRENGTH,
    SS_STRENGTH: SS_STRENGTH,
    BODY_STRENGTH_DEFAULT: BODY_STRENGTH_DEFAULT,
    clamp: clamp,
    num: num,
    tailsShare: tailsShare,
    fractions: fractions,
    fromWash: fromWash,
    fromSugar: fromSugar,
    dilute: dilute,
    correctReading: correctReading
  };

  global.Calc = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
