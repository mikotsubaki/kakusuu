/* みこぷらん 画数診断 — 画数計算ロジック
 * 診断データ（CSV）とは独立しています。画面表示は app.js が担当します。
 * ブラウザでは window.StrokeCalc、Node.js では module.exports として使えます。
 */
(function (root) {
  "use strict";

  function createCalculator(kanjiData, kyujitaiMap, kana, latin) {
    latin = latin || { upper: {}, lower: {} };
    /* 漢字 → 画数 */
    var kanji = new Map();
    Object.keys(kanjiData.byStroke).forEach(function (n) {
      Array.from(kanjiData.byStroke[n]).forEach(function (c) { kanji.set(c, Number(n)); });
    });

    /* 新字体 → 旧字体（検証済み）と、その逆引き */
    var toKyu = new Map(Object.entries(kyujitaiMap.verified));
    var toShin = new Map();
    toKyu.forEach(function (o, n) { toShin.set(o, n); });
    var unverifiable = new Map(Object.entries(kyujitaiMap.unverifiable));
    var ambiguous = new Map(Object.entries(kyujitaiMap.ambiguous));
    var glyphOnly = new Set(Array.from(kyujitaiMap.glyphOnly));

    /* CJK互換漢字（例：社・器）は Unicode の正準分解で元の字に対応づけられる。
       辞書に互換漢字の画数がある字は、旧字体モードでその字形の画数を使う。 */
    var compatOf = new Map(), compatBase = new Map();
    kanji.forEach(function (_n, c) {
      var base = c.normalize("NFC");
      if (base !== c && /\p{Script=Han}/u.test(c) && glyphOnly.has(base)) {
        compatOf.set(base, c); compatBase.set(c, base);
      }
    });

    var DAKU = "\u3099", HANDAKU = "\u309A";

    function isSpace(c) { return /\s/u.test(c); }
    function isHan(c) { return /\p{Script=Han}/u.test(c); }

    /* かな1文字（濁点などを分解した状態）の画数 */
    function kanaStroke(c) {
      var base = kana.small[c] || c;
      if (kana.hiragana[base] != null) return kana.hiragana[base];
      if (kana.katakana[base] != null) return kana.katakana[base];
      return null;
    }

    /**
     * 名前の画数を計算する。
     * @param {string} input 入力された名前
     * @param {"shin"|"kyu"} mode 新字体 / 旧字体
     * @returns {{ok:boolean,total:number|null,chars:Array,errors:Array,cautions:Array,skippedSpaces:boolean,normalized:string}}
     */
    function calculate(input, mode) {
      mode = mode === "kyu" ? "kyu" : "shin";
      /* 漢字以外だけを NFKC 正規化（半角カナ→全角、全角英数→半角など）。
         漢字は互換漢字（旧字体の字形）を保つため正規化しない。 */
      var normalized = (input || "").replace(/[^\p{Script=Han}]+/gu, function (s) { return s.normalize("NFKC"); });
      var chars = [];
      var errors = [];
      var cautions = [];
      var skippedSpaces = false;
      var prevKanjiStroke = null;

      Array.from(normalized).forEach(function (c) {
        if (isSpace(c)) { skippedSpaces = true; return; }

        var item = { input: c, used: c, strokes: null, note: "", error: "", caution: "" };

        /* 踊り字 */
        if (c === "々") {
          if (prevKanjiStroke != null) {
            item.strokes = prevKanjiStroke;
            item.note = "直前の漢字と同じ画数";
          } else {
            item.error = "「々」の前に漢字がないため、画数を確認できません";
          }
          push(item); return;
        }

        /* 長音符 */
        if (c === "ー") {
          item.strokes = kana.chouon; item.note = "長音符";
          prevKanjiStroke = null; push(item); return;
        }

        /* 漢字 */
        if (kanji.has(c) || isHan(c)) {
          var target = c;
          if (mode === "shin" && (toShin.has(c) || compatBase.has(c))) {
            target = toShin.get(c) || compatBase.get(c);
            item.note = "旧字体「" + c + "」を新字体「" + target + "」で計算";
          } else if (mode === "kyu") {
            if (compatOf.has(c)) {
              target = compatOf.get(c);
              item.note = "旧字体の字形（" + target + "）の画数で計算";
            } else if (toKyu.has(c)) {
              target = toKyu.get(c);
              item.note = "新字体「" + c + "」を旧字体「" + target + "」で計算";
            } else if (ambiguous.has(c)) {
              item.error = "意味によって旧字体が異なる字です（" + ambiguous.get(c) + "）。旧字体を直接入力するか、新字体で計算してください";
              prevKanjiStroke = null; push(item); return;
            } else if (unverifiable.has(c)) {
              item.error = "旧字体「" + unverifiable.get(c) + "」の画数を辞書で確認できません";
              prevKanjiStroke = null; push(item); return;
            } else if (glyphOnly.has(c)) {
              item.caution = "旧字体では字形の細部が異なる字です。辞書の画数で計算していますが、流派により数え方が異なる場合があります";
            }
          }
          item.used = target;
          if (kanji.has(target)) {
            item.strokes = kanji.get(target);
            prevKanjiStroke = item.strokes;
          } else {
            item.error = "この文字の画数は確認できません（画数辞書に未収録）";
            prevKanjiStroke = null;
          }
          push(item); return;
        }

        prevKanjiStroke = null;

        /* かな（濁点・半濁点を分解して数える） */
        var parts = Array.from(c.normalize("NFD"));
        var baseStroke = kanaStroke(parts[0]);
        if (baseStroke != null) {
          var s = baseStroke, notes = [];
          if (kana.small[parts[0]]) notes.push("小書き文字は元の字と同じ");
          for (var i = 1; i < parts.length; i++) {
            if (parts[i] === DAKU) { s += kana.dakuten; notes.push("濁点+" + kana.dakuten); }
            else if (parts[i] === HANDAKU) { s += kana.handakuten; notes.push("半濁点+" + kana.handakuten); }
            else { s = null; break; }
          }
          if (s != null) { item.strokes = s; item.note = notes.join("・"); }
          else item.error = "この文字の画数は確認できません";
          push(item); return;
        }

        if (latin.upper[c] != null || latin.lower[c] != null) {
          var up = latin.upper[c] != null;
          item.strokes = up ? latin.upper[c] : latin.lower[c];
          item.note = up ? "英字（大文字）" : "英字（小文字）";
          item.latin = true;
          push(item); return;
        }
        if (/[0-9]/.test(c)) {
          item.error = "数字は画数の統一基準がないため、初期版では計算しません";
        } else if (/^[A-Za-z]/.test(c.normalize("NFD"))) {
          item.error = "アクセント記号つきの英字は計算しません";
        } else if (/[ぁ-ゟァ-ヺー-ヿ]/.test(c)) {
          item.error = "この文字の画数は確認できません（数え方が定まらないため初期版では未対応）";
        } else {
          item.error = "記号は画数に含められません。記号を除いて入力してください";
        }
        push(item);
      });

      function push(item) {
        chars.push(item);
        if (item.error) errors.push(item);
        if (item.caution) cautions.push(item);
      }

      var ok = chars.length > 0 && errors.length === 0;
      var total = ok ? chars.reduce(function (a, x) { return a + x.strokes; }, 0) : null;
      return { ok: ok, total: total, chars: chars, errors: errors, cautions: cautions,
               hasLatin: chars.some(function (x) { return x.latin; }),
               skippedSpaces: skippedSpaces, normalized: normalized, mode: mode };
    }

    return {
      calculate: calculate,
      kanjiCount: kanji.size,
      kyuPairCount: toKyu.size,
      compatCount: compatOf.size,
      strokeOf: function (c) { return kanji.has(c) ? kanji.get(c) : null; }
    };
  }

  /* CSV（RFC 4180 形式：ダブルクォート・改行入りセルに対応）を読む */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(function (v) { return v.trim() !== ""; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function (v) { return v.trim() !== ""; })) rows.push(row);
    return rows;
  }

  var REQUIRED = ["画数", "星評価", "キーワード", "特徴", "強み", "注意点", "活かし方", "判定根拠"];

  /* 診断データを読み込み、1〜81画が揃っているか検証する */
  function loadKakusuData(csvText) {
    var rows = parseCSV(csvText);
    var problems = [];
    if (!rows.length) return { data: new Map(), problems: ["CSVが空です"] };
    var header = rows[0].map(function (h) { return h.trim(); });
    var idx = {};
    REQUIRED.forEach(function (h) {
      idx[h] = header.indexOf(h);
      if (idx[h] < 0) problems.push("列「" + h + "」がありません");
    });
    var data = new Map();
    if (problems.length) return { data: data, problems: problems };
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      var n = Number(String(r[idx["画数"]]).trim());
      var star = String(r[idx["星評価"]]).trim();
      if (!Number.isInteger(n) || n < 1 || n > 81) { problems.push(line + "行目：画数「" + r[idx["画数"]] + "」が1〜81の整数ではありません"); return; }
      if (!/^[0-3]$/.test(star)) { problems.push(line + "行目：星評価「" + star + "」が0〜3ではありません"); return; }
      if (data.has(n)) { problems.push(line + "行目：" + n + "画が重複しています"); return; }
      var rec = { kakusu: n, stars: Number(star) };
      [["キーワード", "keyword"], ["特徴", "feature"], ["強み", "strength"], ["注意点", "caution"], ["活かし方", "advice"], ["判定根拠", "basis"]]
        .forEach(function (p) { rec[p[1]] = String(r[idx[p[0]]] == null ? "" : r[idx[p[0]]]).trim(); });
      data.set(n, rec);
    });
    for (var k = 1; k <= 81; k++) if (!data.has(k)) problems.push(k + "画のデータがありません");
    return { data: data, problems: problems };
  }

  var api = { createCalculator: createCalculator, parseCSV: parseCSV, loadKakusuData: loadKakusuData };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StrokeCalc = api;
})(typeof window !== "undefined" ? window : this);
