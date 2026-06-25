# -*- coding: utf-8 -*-
"""cnlunar 查询桥接：stdin读一行 JSON，stdout 输出 UTF-8 JSON。
依赖：pip install cnlunar（https://github.com/OPN48/cnlunar）
"""
from __future__ import annotations

import datetime
import json
import sys


def _json_safe(x):
    if x is None or isinstance(x, (bool, int, float, str)):
        return x
    if isinstance(x, datetime.datetime):
        return x.isoformat(sep=" ", timespec="seconds")
    if isinstance(x, datetime.date):
        return x.isoformat()
    if isinstance(x, (list, tuple)):
        return [_json_safe(i) for i in x]
    if isinstance(x, dict):
        out = {}
        for k, v in x.items():
            out[str(k)] = _json_safe(v)
        return out
    return str(x)


def _build_result(a) -> dict:
    """与项目 README 示例字段对齐，便于客户端展示。"""
    return {
        "日期": _json_safe(a.date),
        "农历数字": _json_safe(
            (a.lunarYear, a.lunarMonth, a.lunarDay, "闰" if a.isLunarLeapMonth else "")
        ),
        "农历": "%s %s[%s]年 %s%s"
        % (a.lunarYearCn, a.year8Char, a.chineseYearZodiac, a.lunarMonthCn, a.lunarDayCn),
        "星期": _json_safe(a.weekDayCn),
        "今日节日": _json_safe(
            (a.get_legalHolidays(), a.get_otherHolidays(), a.get_otherLunarHolidays())
        ),
        "八字": " ".join([a.year8Char, a.month8Char, a.day8Char, a.twohour8Char]),
        "今日节气": _json_safe(a.todaySolarTerms),
        "下一节气": _json_safe((a.nextSolarTerm, a.nextSolarTermDate, a.nextSolarTermYear)),
        "今年节气表": _json_safe(getattr(a, "thisYearSolarTermsDic", {})),
        "季节": _json_safe(a.lunarSeason),
        "今日时辰": _json_safe(a.twohour8CharList),
        "时辰凶吉": _json_safe(a.get_twohourLuckyList()),
        "生肖冲煞": _json_safe(a.chineseZodiacClash),
        "星座": _json_safe(a.starZodiac),
        "星次": _json_safe(a.todayEastZodiac),
        "彭祖百忌": _json_safe(a.get_pengTaboo()),
        "十二神": _json_safe(a.get_today12DayOfficer()),
        "廿八宿": _json_safe(a.get_the28Stars()),
        "今日三合": _json_safe(a.zodiacMark3List),
        "今日六合": _json_safe(a.zodiacMark6),
        "今日五行": _json_safe(a.get_today5Elements()),
        "纳音": _json_safe(a.get_nayin()),
        "九宫飞星": _json_safe(a.get_the9FlyStar()),
        "吉神方位": _json_safe(a.get_luckyGodsDirection()),
        "今日胎神": _json_safe(a.get_fetalGod()),
        "神煞宜忌": _json_safe(a.angelDemon),
        "今日吉神": _json_safe(a.goodGodName),
        "今日凶煞": _json_safe(a.badGodName),
        "宜忌等第": _json_safe(a.todayLevelName),
        "宜": _json_safe(a.goodThing),
        "忌": _json_safe(a.badThing),
        "时辰经络": _json_safe(a.meridians),
    }


def main() -> None:
    try:
        import cnlunar  # noqa: PLC0415
    except ImportError:
        msg = {
            "ok": False,
            "error": "本机未安装 Python 库 cnlunar。请在当前 Python 环境执行：pip install cnlunar",
            "installHint": "pip install cnlunar",
            "source": "https://github.com/OPN48/cnlunar",
        }
        sys.stdout.buffer.write(json.dumps(msg, ensure_ascii=False).encode("utf-8"))
        sys.exit(1)

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        msg = {"ok": False, "error": f"stdin JSON 无效: {e}"}
        sys.stdout.buffer.write(json.dumps(msg, ensure_ascii=False).encode("utf-8"))
        return

    try:
        y = int(payload["year"])
        m = int(payload["month"])
        d = int(payload["day"])
        h = int(payload.get("hour", 0))
        mi = int(payload.get("minute", 0))
        s = int(payload.get("second", 0))
    except (KeyError, TypeError, ValueError) as e:
        msg = {"ok": False, "error": f"缺少或非法的 year/month/day: {e}"}
        sys.stdout.buffer.write(json.dumps(msg, ensure_ascii=False).encode("utf-8"))
        return

    god_type = str(payload.get("godType") or "8char")
    if god_type not in ("8char", "cnlunar"):
        god_type = "8char"

    try:
        dt = datetime.datetime(y, m, d, h, mi, s)
        a = cnlunar.Lunar(dt, godType=god_type)
        out = {
            "ok": True,
            "library": "cnlunar",
            "libraryHome": "https://github.com/OPN48/cnlunar",
            "godType": god_type,
            "solar": {"year": y, "month": m, "day": d, "hour": h, "minute": mi, "second": s},
            "result": _build_result(a),
        }
    except Exception as e:  # noqa: BLE001
        out = {"ok": False, "error": str(e)}

    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
