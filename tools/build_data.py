#!/usr/bin/env python3
"""
みこぷらん 画数診断 — データ生成スクリプト（開発者向け）

使い方:
  python3 tools/build_data.py <KANJIS.json> <kyujitai.json> <mikoplan_81_kakusu.csv>

生成物:
  data/kanji-strokes.js   … KANJIDIC2 由来の漢字画数辞書
  data/kyujitai-map.js    … 新字体⇔旧字体の検証済み対応表
  data/kakusu-fallback.js … CSV の内蔵コピー（index.html を直接開いた時の予備）

CSV の内蔵コピーだけ作り直す場合:
  python3 tools/build_data.py --csv-only data/mikoplan_81_kakusu.csv
"""
import csv, json, sys, os, collections, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# kyujitai.js の対応のうち、常用漢字表・人名用漢字表で「旧字体（康熙字典体）」として
# 扱われていない異体字関係のもの。旧字体モードの自動変換から除外する。
NOT_KYUJITAI = set("回冴凜萌鎌刃妊糾隣携亘粘")

# 新字体と同じ形の字が、旧字体期にも「別の意味の字」として存在していたもの。
# どちらの旧字体を使うかは意味で決まるため、自動変換しない（旧字体モードでは要確認扱い）。
AMBIGUOUS = {
    "余": "余（われ）／餘（あまる）",
    "欠": "欠（あくび）／缺（かける）",
    "糸": "糸（いと・細い糸）／絲（いと）",
    "芸": "芸（香草の名）／藝（わざ）",
    "虫": "虫（まむし）／蟲（むし）",
    "缶": "缶（ほとぎ）／罐（かま・かん）",
    "台": "台（われ・うてな）／臺（うてな）／颱など",
    "証": "証（いさめる）／證（あかし）",
    "弁": "辨・辯・瓣・辮（意味により異なる）",
    "予": "予（われ）／豫（あらかじめ）",
}


def write_js(path, varname, obj, header):
    with open(path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write(f"window.{varname} = ")
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


def build_csv(csv_path):
    rows = []
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    with open(csv_path, encoding="utf-8-sig") as f:
        raw = f.read()
    nums = sorted(int(r["画数"]) for r in rows)
    assert nums == list(range(1, 82)), f"1〜81画が揃っていません: {len(nums)}件"
    write_js(
        os.path.join(DATA, "kakusu-fallback.js"),
        "KAKUSU_CSV_FALLBACK",
        raw,
        "/* 自動生成ファイル：data/mikoplan_81_kakusu.csv の内蔵コピーです。直接編集しないでください。\n"
        "   CSVを編集したら tools/build_data.py --csv-only で作り直します。 */\n",
    )
    print("kakusu-fallback.js:", len(rows), "件")


def main():
    if sys.argv[1] == "--csv-only":
        build_csv(sys.argv[2])
        return
    kanjis_path, kyu_path, csv_path = sys.argv[1:4]
    K = json.load(open(kanjis_path, encoding="utf-8"))
    lit = {k["literal"]: k for k in K}

    # ---- 画数辞書（KANJIDIC2 の stroke_count の先頭＝正しい画数）----
    by_stroke = collections.defaultdict(list)
    for k in K:
        sc = k.get("strokeCounts") or []
        if sc:
            by_stroke[sc[0]].append(k["literal"])
    strokes = {str(n): "".join(sorted(cs)) for n, cs in sorted(by_stroke.items())}
    total = sum(len(v) for v in by_stroke.values())
    write_js(
        os.path.join(DATA, "kanji-strokes.js"),
        "KANJI_STROKES",
        {"source": "KANJIDIC2 (EDRDG) via kanjidic2-json 0.1.0", "license": "CC BY-SA 4.0",
         "count": total, "byStroke": strokes},
        "/* 漢字画数辞書：KANJIDIC2（© Electronic Dictionary Research and Development Group）\n"
        "   ライセンス：Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）\n"
        "   https://www.edrdg.org/edrdg/licence.html\n"
        "   本ファイルは KANJIDIC2 の stroke_count（先頭値）を画数別に並べ替えた派生データで、同ライセンスで提供します。 */\n",
    )
    print("kanji-strokes.js:", total, "字")

    # ---- 旧字体対応表（kyujitai.js × KANJIDIC2 異体字参照で相互検証）----
    jis = {}
    for k in K:
        for t, v in k["codepoints"].items():
            if t.startswith("jis"):
                jis[(t, v)] = k["literal"]

    def variants(c):
        out = set()
        k = lit.get(c)
        if not k:
            return out
        for v in k.get("variants") or []:
            t = v["type"]
            if t.startswith("jis") and (t, v["value"]) in jis:
                out.add(jis[(t, v["value"])])
            if t == "ucs":
                out.add(chr(int(v["value"], 16)))
        return out

    ky = json.load(open(kyu_path, encoding="utf-8"))["kyuji"]
    verified, unverifiable, glyph_only, excluded = {}, {}, set(), {}
    for new, old, _ivs in ky:
        if new == old:
            glyph_only.add(new)
            continue
        if new in NOT_KYUJITAI or new in AMBIGUOUS:
            excluded[new] = old
            continue
        if new in lit and old in lit and (old in variants(new) or new in variants(old)):
            verified[new] = old
        else:
            unverifiable[new] = old
    glyph_only -= set(verified) | set(unverifiable)
    write_js(
        os.path.join(DATA, "kyujitai-map.js"),
        "KYUJITAI_MAP",
        {
            "source": "kyujitai.js 1.3.0 (MIT, hakatashi) の対応表を KANJIDIC2 の異体字参照で検証",
            "builtAt": datetime.date.today().isoformat(),
            "verified": verified,                 # 新字体 → 旧字体（自動変換に使用）
            "unverifiable": unverifiable,         # 旧字体の画数を辞書で確認できない
            "ambiguous": AMBIGUOUS,               # 意味により旧字体が変わる（自動変換しない）
            "glyphOnly": "".join(sorted(glyph_only)),  # 字形の細部のみ異なる（同じ文字コード）
        },
        "/* 新字体⇔旧字体 対応表（自動生成）\n"
        "   元データ：kyujitai.js 1.3.0（MIT License, © hakatashi）\n"
        "   検証：KANJIDIC2 の異体字相互参照で確認できた組のみ verified に採用 */\n",
    )
    print("kyujitai-map.js: verified", len(verified), "unverifiable", len(unverifiable),
          "excluded", len(excluded), "glyphOnly", len(glyph_only))
    build_csv(csv_path)


if __name__ == "__main__":
    main()
