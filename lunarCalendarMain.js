/**
 * 封装6tail/lunar-javascript（MIT）
 * https://github.com/6tail/lunar-javascript
 */
const { Solar, Lunar, HolidayUtil } = require("lunar-javascript");

function clampInt(n, def, min, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) {
    return def;
  }
  return Math.min(max, Math.max(min, x));
}

function runLunarCalendarQuery(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const op = String(p.op || "solar_to_lunar")
    .toLowerCase()
    .replace(/-/g, "_");

  if (op === "lunar_to_solar") {
    const y = clampInt(p.lunar_year ?? p.year, NaN, 1, 2100);
    const m = clampInt(p.lunar_month ?? p.month, NaN, 1, 12);
    const d = clampInt(p.lunar_day ?? p.day, NaN, 1, 30);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return { ok: false, error: "lunar_to_solar 需要 lunar_year、lunar_month、lunar_day（农历年月日）。" };
    }
    const hour = clampInt(p.hour ?? 0, 0, 0, 23);
    const minute = clampInt(p.minute ?? 0, 0, 0, 59);
    const second = clampInt(p.second ?? 0, 0, 0, 59);
    let lunar;
    try {
      lunar = Lunar.fromYmdHms(y, m, d, hour, minute, second);
    } catch (e) {
      return { ok: false, error: String(e?.message || e || "农历日期无效") };
    }
    const solar = lunar.getSolar();
    const ec = lunar.getEightChar();
    return {
      ok: true,
      library: "lunar-javascript",
      libraryHome: "https://github.com/6tail/lunar-javascript",
      op: "lunar_to_solar",
      lunarInput: { year: y, month: m, day: d, hour, minute, second },
      solar: {
        year: solar.getYear(),
        month: solar.getMonth(),
        day: solar.getDay(),
        fullString: solar.toFullString(),
      },
      lunar: {
        fullString: lunar.toFullString(),
      },
      eightChar: {
        year: ec.getYear(),
        month: ec.getMonth(),
        day: ec.getDay(),
        time: ec.getTime(),
      },
    };
  }

  /* solar_to_lunar */
  const y = clampInt(p.year, NaN, 1, 2100);
  const m = clampInt(p.month, NaN, 1, 12);
  const d = clampInt(p.day, NaN, 1, 31);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { ok: false, error: "solar_to_lunar 需要 year、month、day（阳历年月日）。" };
  }
  const hour = clampInt(p.hour ?? 0, 0, 0, 23);
  const minute = clampInt(p.minute ?? 0, 0, 0, 59);
  const second = clampInt(p.second ?? 0, 0, 0, 59);
  let solar;
  let lunar;
  try {
    solar = Solar.fromYmdHms(y, m, d, hour, minute, second);
    lunar = solar.getLunar();
  } catch (e) {
    return { ok: false, error: String(e?.message || e || "阳历日期无效") };
  }
  const ec = lunar.getEightChar();
  let holiday = null;
  try {
    const h = HolidayUtil.getHoliday(y, m, d);
    if (h && typeof h.getName === "function") {
      holiday = {
        name: h.getName(),
        work: typeof h.isWork === "function" ? h.isWork() : null,
        target: typeof h.getTarget === "function" ? h.getTarget() : null,
      };
    }
  } catch {
    holiday = null;
  }
  return {
    ok: true,
    library: "lunar-javascript",
    libraryHome: "https://github.com/6tail/lunar-javascript",
    apiDoc: "https://6tail.cn/calendar/api.html",
    op: "solar_to_lunar",
    solar: {
      ymdhms: [y, m, d, hour, minute, second],
      fullString: solar.toFullString(),
    },
    lunar: {
      fullString: lunar.toFullString(),
      yearInGanZhi: lunar.getYearInGanZhi(),
      monthInGanZhi: lunar.getMonthInGanZhi(),
      dayInGanZhi: lunar.getDayInGanZhi(),
      timeInGanZhi: lunar.getTimeInGanZhi(),
    },
    eightChar: {
      year: ec.getYear(),
      month: ec.getMonth(),
      day: ec.getDay(),
      time: ec.getTime(),
    },
    holiday,
  };
}

module.exports = { runLunarCalendarQuery };
