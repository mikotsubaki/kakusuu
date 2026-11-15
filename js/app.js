/* みこぷらん 画数診断 — 画面の動き */
(function () {
  "use strict";

  var STAR_LABELS = {
    3: "伝統的に良い評価が強い数字",
    2: "良い評価が比較的多い数字",
    1: "注意点もある数字",
    0: "慎重な解釈が必要な数字"
  };
  var DISCLAIMER = "この診断は伝統的な81数理の解釈を参考に、みこぷらんが独自に構成したものです。数字の意味を知り、名付けの参考としてお楽しみください。将来の成功や運命を保証するものではありません。";
  var MAX_KAKUSU = 81;
  var CSV_PATH = "data/mikoplan_81_kakusu.csv";

  var calc = StrokeCalc.createCalculator(window.KANJI_STROKES, window.KYUJITAI_MAP, window.KANA_STROKES, window.LATIN_STROKES);
  var state = { mode: "shin", data: new Map(), dataSource: "", problems: [], lastResult: null, searchMin: 2 };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function modeName(m) { return m === "kyu" ? "旧字体" : "新字体"; }

  /* ---------- 星 ---------- */
  function starsHTML(n, cls) {
    var out = '<span class="' + (cls || "stars") + '" role="img" aria-label="星3つ中' + n + 'つ">';
    for (var i = 0; i < 3; i++) {
      out += '<svg class="star' + (i < n ? " on" : " off") + '" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 2.6l2.83 5.95 6.52.82-4.8 4.5 1.24 6.46L12 17.17l-5.79 3.16 1.24-6.46-4.8-4.5 6.52-.82z"/></svg>';
    }
    return out + "</span>";
  }
  function starsText(n) { return "★★★".slice(0, n) + "☆☆☆".slice(0, 3 - n); }

  /* ---------- 診断データの読み込み ---------- */
  function loadData() {
    var fromFallback = function (reason) {
      if (typeof window.KAKUSU_CSV_FALLBACK !== "string") return Promise.reject(new Error("診断データが見つかりません"));
      state.dataSource = "内蔵コピー（data/kakusu-fallback.js）" + (reason ? "：" + reason : "");
      return window.KAKUSU_CSV_FALLBACK;
    };
    var p;
    if (location.protocol === "file:") {
      p = Promise.resolve(fromFallback("ファイルを直接開いているため"));
    } else {
      p = fetch(CSV_PATH, { cache: "no-cache" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.arrayBuffer();
        })
        .then(function (buf) {
          state.dataSource = CSV_PATH;
          return new TextDecoder("utf-8").decode(buf);
        })
        .catch(function (e) { return fromFallback("CSVを読み込めなかったため（" + e.message + "）"); });
    }
    return p.then(function (text) {
      var r = StrokeCalc.loadKakusuData(text);
      state.data = r.data;
      state.problems = r.problems;
      renderDataAlert();
      renderAbout();
    }).catch(function (e) {
      state.problems = [e.message];
      renderDataAlert();
    });
  }

  function renderDataAlert() {
    var el = $("#data-alert");
    if (!state.problems.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<strong>診断データ（CSV）に確認が必要な箇所があります。</strong>該当する画数の診断は表示されません。<ul>" +
      state.problems.slice(0, 12).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") +
      (state.problems.length > 12 ? "<li>ほか " + (state.problems.length - 12) + " 件</li>" : "") + "</ul>";
  }

  /* ---------- タブ ---------- */
  function showPanel(name) {
    $$(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.panel === name)); });
    $$(".panel").forEach(function (p) { p.hidden = p.id !== "panel-" + name; });
    if (name === "search") prefillSearch();
    window.scrollTo(0, 0);
  }
  $$(".tab").forEach(function (t) { t.addEventListener("click", function () { showPanel(t.dataset.panel); }); });

  /* ---------- 字体切り替え ---------- */
  $$(".mode-bar [data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.mode = b.dataset.mode;
      $$(".mode-bar [data-mode]").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
      if ($("#name-input").value.trim()) runDiagnose(false);
      if ($("#compare-result").innerHTML) runCompare();
      if (!$("#panel-search").hidden) { prefillSearch(true); }
      toast(modeName(state.mode) + "で計算します");
    });
  });

  /* ---------- 診断 ---------- */
  function selectedType() { var r = $('input[name="type"]:checked'); return r ? r.value : "その他"; }

  function charsHTML(res) {
    var items = res.chars.map(function (c) {
      var cls = "char-item" + (c.error ? " is-error" : c.caution ? " is-caution" : "") + (c.latin ? " is-latin" : "");
      var ch = c.used !== c.input ? esc(c.used) : esc(c.input);
      return '<li class="' + cls + '"><span class="ch">' + ch + '</span><span class="st">' +
        (c.error ? "確認不可" : c.strokes + "画") + "</span></li>";
    }).join("");
    var notes = [];
    res.chars.forEach(function (c) {
      if (c.error) {
        var msg = /^この文字の画数は確認できません/.test(c.error) ? c.error : "この文字の画数は確認できません：" + c.error;
        notes.push('<li class="err">「' + esc(c.input) + "」" + esc(msg) + "</li>");
      }
      else {
        if (c.note && !c.latin) notes.push("<li>「" + esc(c.input) + "」" + esc(c.note) + "</li>");
        if (c.caution) notes.push("<li>「" + esc(c.input) + "」" + esc(c.caution) + "</li>");
      }
    });
    if (res.hasLatin) notes.push("<li>英字はみこぷらんの採用ルール（ブロック体で、直線・曲線のまとまりごとに1画）で数えています。英字の数え方は流派によって異なります</li>");
    if (res.skippedSpaces) notes.push("<li>スペースは数えずに計算しています</li>");
    return '<ul class="char-list">' + items + "</ul>" + (notes.length ? '<ul class="char-notes">' + notes.join("") + "</ul>" : "");
  }

  function block(num, title, inner) {
    return '<div class="block"><p class="block-title"><span class="num">' + num + "</span>" + title + "</p>" + inner + "</div>";
  }

  function runDiagnose(scroll) {
    var name = $("#name-input").value.trim();
    var box = $("#result");
    if (!name) { box.innerHTML = ""; state.lastResult = null; return; }
    var res = calc.calculate(name, state.mode);
    var type = selectedType();
    var rec = res.ok && res.total <= MAX_KAKUSU ? state.data.get(res.total) : null;
    state.lastResult = { name: name, type: type, res: res, rec: rec, mode: state.mode };

    var h = '<article class="card result-card">';
    h += '<div class="result-head"><p class="result-type">' + esc(type) + '</p><p class="result-name">' + esc(name) + "</p></div>";
    h += '<div class="result-body">';
    h += block("2", "一文字ごとの画数", charsHTML(res));

    if (!res.ok) {
      h += '<div class="notice error"><strong>総画数を計算できませんでした</strong>画数を確認できない文字が含まれているため、誤った診断を避けて総画数と診断結果を表示していません。上の説明をご確認のうえ、文字を変えて入力してください。</div>';
    } else {
      h += block("3", "総画数", '<div class="total"><span class="total-num">' + res.total + '</span><span class="total-unit">画</span></div><p class="total-mode">' + modeName(res.mode) + "で計算</p>");
      if (res.cautions.length) {
        h += '<div class="notice"><strong>字形についてのご注意</strong>旧字体では字形の細部が異なる文字があります。旧字体の字形で数える流派では、総画数が変わる場合があります。</div>';
      }
      if (res.total > MAX_KAKUSU) {
        h += '<div class="notice"><strong>評価対象外</strong>81画を超えるため、現在の診断方式では評価対象外です。81画を超える数の換算方法は流派によって異なるため、この診断では換算していません。</div>';
      } else if (!rec) {
        h += '<div class="notice error"><strong>診断データがありません</strong>' + res.total + "画の診断データが読み込めませんでした。管理者がCSVを確認してください。</div>";
      } else {
        h += block("4", "星評価", starsHTML(rec.stars) + '<p class="star-label">' + esc(STAR_LABELS[rec.stars]) + "</p>");
        h += block("5", "キーワード", '<span class="keyword">' + esc(rec.keyword) + "</span>");
        h += block("6", "数字が持つ特徴", "<p>" + esc(rec.feature) + "</p>");
        h += block("7", "強み", "<p>" + esc(rec.strength) + "</p>");
        h += block("8", "注意点", "<p>" + esc(rec.caution) + "</p>");
        h += block("9", "活かし方", "<p>" + esc(rec.advice) + "</p>");
      }
    }
    h += "</div>";
    h += '<div class="result-actions">';
    if (res.ok) {
      h += '<button type="button" class="btn btn-outline btn-small" data-act="copy">結果をコピー</button>';
      h += '<button type="button" class="btn btn-accent btn-small" data-act="share">共有する</button>';
      if (res.total < MAX_KAKUSU) h += '<button type="button" class="btn btn-ghost btn-small full" data-act="search">星2つ以上の画数をさがす</button>';
    }
    h += "</div>";
    h += '<p class="result-foot">' + esc(DISCLAIMER) + "</p>";
    h += "</article>";
    box.innerHTML = h;
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resultText() {
    var L = state.lastResult;
    if (!L || !L.res.ok) return "";
    var r = L.res, rec = L.rec;
    var lines = ["みこぷらん 画数診断", "", "【名前】" + L.name + "（" + L.type + "）",
      "【画数】" + r.chars.map(function (c) { return c.used + c.strokes; }).join("・"),
      "【総画数】" + r.total + "画（" + modeName(r.mode) + "）"];
    if (r.total > MAX_KAKUSU) lines.push("81画を超えるため、現在の診断方式では評価対象外です。");
    else if (rec) {
      lines.push("【星評価】" + starsText(rec.stars) + "（" + STAR_LABELS[rec.stars] + "）",
        "【キーワード】" + rec.keyword, "【特徴】" + rec.feature, "【強み】" + rec.strength,
        "【注意点】" + rec.caution, "【活かし方】" + rec.advice);
    }
    lines.push("", "※" + DISCLAIMER);
    if (/^https?:/.test(location.href)) lines.push(location.origin + location.pathname);
    return lines.join("\n");
  }

  $("#diagnose-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("#name-input").blur();
    runDiagnose(true);
  });
  var liveTimer;
  $("#name-input").addEventListener("input", function () {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { runDiagnose(false); }, 350);
  });
  $$('input[name="type"]').forEach(function (r) { r.addEventListener("change", function () { if ($("#name-input").value.trim()) runDiagnose(false); }); });
  $("#clear-btn").addEventListener("click", function () {
    $("#name-input").value = ""; $("#result").innerHTML = ""; state.lastResult = null; $("#name-input").focus();
  });

  $("#result").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "copy") copyText(resultText());
    if (b.dataset.act === "share") shareText(resultText());
    if (b.dataset.act === "search") { showPanel("search"); }
  });

  /* ---------- コピー・共有 ---------- */
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || "診断結果をコピーしました"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : toast("コピーできませんでした"); });
    } else {
      legacyCopy(text) ? done() : toast("コピーできませんでした");
    }
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    var range = document.createRange(); range.selectNodeContents(ta);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function shareText(text) {
    if (navigator.share) {
      navigator.share({ title: "みこぷらん 画数診断", text: text }).catch(function (e) {
        if (e && e.name !== "AbortError") copyText(text);
      });
    } else {
      copyText(text, "共有機能がないため、診断結果をコピーしました");
    }
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- 比較 ---------- */
  function runCompare() {
    var names = ["#cmp1", "#cmp2", "#cmp3"].map(function (s) { return $(s).value.trim(); });
    var box = $("#compare-result");
    var filled = names.filter(Boolean);
    if (!filled.length) { box.innerHTML = '<div class="notice">比べたい名前を1つ以上入力してください。</div>'; return; }
    var h = '<div class="compare-list">';
    names.forEach(function (n, i) {
      if (!n) return;
      var r = calc.calculate(n, state.mode);
      h += '<article class="card compare-item"><span class="c-label">候補 ' + (i + 1) + '</span>';
      h += '<span class="c-name">' + esc(n) + "</span>";
      if (!r.ok) {
        h += '<span class="c-total">—</span><p class="c-err">画数を確認できない文字（' +
          r.errors.map(function (x) { return "「" + esc(x.input) + "」"; }).join("") + "）が含まれるため、総画数を計算していません。</p>";
      } else {
        h += '<span class="c-total">' + r.total + "画</span>";
        var rec = r.total <= MAX_KAKUSU ? state.data.get(r.total) : null;
        if (r.total > MAX_KAKUSU) h += '<p class="c-err">81画を超えるため評価対象外です。</p>';
        else if (rec) h += '<div class="c-meta">' + starsHTML(rec.stars, "stars-small") + '<span class="c-kw">' + esc(rec.keyword) + "</span></div>";
        h += '<button type="button" class="btn btn-ghost btn-small c-link" data-detail="' + esc(n) + '">くわしく見る</button>';
      }
      h += "</article>";
    });
    h += "</div>";
    h += '<p class="notice">星の数は、数字の伝統的な評価を目安として表したものです。どの名前が一番良いかを決めるものではありません。響きや覚えやすさ、込めたい想いとあわせてお選びください。（' + modeName(state.mode) + "で計算）</p>";
    box.innerHTML = h;
  }
  $("#compare-form").addEventListener("submit", function (e) { e.preventDefault(); document.activeElement.blur(); runCompare(); });
  $("#compare-clear").addEventListener("click", function () {
    ["#cmp1", "#cmp2", "#cmp3"].forEach(function (s) { $(s).value = ""; });
    $("#compare-result").innerHTML = "";
  });
  $("#compare-result").addEventListener("click", function (e) {
    var b = e.target.closest("[data-detail]");
    if (!b) return;
    $("#name-input").value = b.dataset.detail;
    showPanel("diagnose");
    runDiagnose(true);
  });

  /* ---------- 吉数候補 ---------- */
  function prefillSearch(force) {
    var L = state.lastResult;
    var input = $("#current-total");
    if (L && L.res.ok) {
      var r = calc.calculate(L.name, state.mode);
      if (r.ok && (force || !input.value || input.dataset.auto === "1")) {
        input.value = r.total; input.dataset.auto = "1";
        $("#search-from").textContent = "「" + L.name + "」の総画数（" + modeName(state.mode) + "）を入れています。";
        runSearch();
      }
    }
  }
  function runSearch() {
    var box = $("#search-result");
    var raw = $("#current-total").value.trim();
    var cur = Number(raw);
    if (raw === "" || !Number.isInteger(cur) || cur < 0) {
      box.innerHTML = '<div class="notice">今の総画数を0以上の整数で入力してください。</div>'; return;
    }
    if (cur >= MAX_KAKUSU) {
      box.innerHTML = '<div class="notice">' + (cur > MAX_KAKUSU ? "81画を超えているため、" : "81画が上限のため、") + "1〜81画の範囲で画数を増やす候補はありません。</div>"; return;
    }
    var min = state.searchMin;
    var h = '<article class="card">';
    var now = state.data.get(cur);
    if (now) {
      h += '<h2 class="section-title">今の画数</h2><ul class="cand-list"><li class="cand is-now"><span class="plus">今<b>' + cur + '</b></span><span class="k">' + cur + "画　" + starsHTML(now.stars, "stars-small") + '</span><span class="kw">' + esc(now.keyword) + "</span></li></ul>";
    }
    var list = [];
    for (var k = cur + 1; k <= MAX_KAKUSU; k++) {
      var rec = state.data.get(k);
      if (rec && rec.stars >= min) list.push(rec);
    }
    h += '<h2 class="section-title" style="margin-top:18px">増やす場合の候補</h2>';
    if (!list.length) h += "<p>この条件に合う画数はありません。</p>";
    else {
      h += '<p class="small">' + cur + "画から、" + (min === 3 ? "星3つ" : "星2つ以上") + "の画数まであと何画かを近い順に表示しています（" + list.length + "件）。</p>";
      h += '<ul class="cand-list">' + list.map(function (r, i) {
        return '<li class="cand"' + (i >= 10 ? ' data-more hidden' : "") + '><span class="plus">あと<b>+' + (r.kakusu - cur) + '</b>画</span><span class="k">' + r.kakusu + "画　" + starsHTML(r.stars, "stars-small") + '</span><span class="kw">' + esc(r.keyword) + "</span></li>";
      }).join("") + "</ul>";
      if (list.length > 10) h += '<div class="actions" style="margin-top:12px"><button type="button" class="btn btn-ghost btn-small" id="more-cands">残り' + (list.length - 10) + "件を見る</button></div>";
    }
    h += '<p class="small" style="margin-top:14px">実際にどの文字を使うかは、意味や響き、読みやすさとあわせてご検討ください。この画面は漢字の組み合わせまでは提案しません。</p></article>';
    box.innerHTML = h;
  }
  $("#search-form").addEventListener("submit", function (e) { e.preventDefault(); document.activeElement.blur(); runSearch(); });
  $("#current-total").addEventListener("input", function () { this.dataset.auto = "0"; $("#search-from").textContent = ""; });
  $$("#search-form [data-min]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.searchMin = Number(b.dataset.min);
      $$("#search-form [data-min]").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
      if ($("#current-total").value.trim() !== "") runSearch();
    });
  });
  $("#search-result").addEventListener("click", function (e) {
    if (e.target.id === "more-cands") {
      $$("#search-result [data-more]").forEach(function (li) { li.hidden = false; });
      e.target.parentNode.remove();
    }
  });

  /* ---------- ルール・資料 ---------- */
  function fill(key, val) { $$('[data-fill="' + key + '"]').forEach(function (el) { el.textContent = val; }); }
  function renderStatic() {
    fill("kanji-count", calc.kanjiCount.toLocaleString("ja-JP"));
    fill("kyu-count", calc.kyuPairCount.toLocaleString("ja-JP"));
    fill("compat-count", String(calc.compatCount));
    var K = window.KANA_STROKES;
    function table(caption, obj) {
      var keys = Object.keys(obj), rows = "";
      for (var i = 0; i < keys.length; i += 5) {
        rows += "<tr>" + keys.slice(i, i + 5).map(function (k) {
          return '<td><span class="kc">' + k + '</span><span class="kn">' + obj[k] + "</span></td>";
        }).join("") + "</tr>";
      }
      return '<table class="kana-grid"><caption>' + caption + "</caption>" + rows + "</table>";
    }
    if (window.KANA_CHANGES) {
      var ch = window.KANA_CHANGES, oldKana = {};
      Object.keys(K.hiragana).forEach(function (k) { oldKana[k] = ch[k] != null ? ch[k] : K.hiragana[k]; });
      var oldCalc = StrokeCalc.createCalculator(window.KANJI_STROKES, window.KYUJITAI_MAP,
        { hiragana: oldKana, katakana: K.katakana, small: K.small, dakuten: K.dakuten, handakuten: K.handakuten, chouon: K.chouon },
        window.LATIN_STROKES);
      var rows = Object.keys(ch).map(function (k) {
        return "<tr><td><span class=\"kc\">" + k + "</span></td><td>" + ch[k] + "画</td><td><strong>" + K.hiragana[k] + "画</strong></td></tr>";
      }).join("");
      var samples = ["みこぷらん", "なごみ", "はなまる", "わんこ", "よるのそら", "えがお"];
      var srows = samples.map(function (w) {
        var a = oldCalc.calculate(w, "shin"), b = calc.calculate(w, "shin");
        return "<tr><td>" + w + "</td><td>" + a.total + "画</td><td><strong>" + b.total + "画</strong></td></tr>";
      }).join("");
      $("#kana-changes").innerHTML =
        '<table class="kana-grid compare-grid"><caption>変更した' + Object.keys(ch).length + '字</caption><tr><th>字</th><th>変更前</th><th>現在</th></tr>' + rows + "</table>" +
        '<table class="kana-grid compare-grid"><caption>計算例（総画数）</caption><tr><th>名前</th><th>変更前</th><th>現在</th></tr>' + srows + "</table>" +
        '<p class="small">変更前は小学校の書写（現代の筆順）の画数です。入力欄の結果はすべて現在の画数表で計算されます。</p>';
    }
    if (window.LATIN_STROKES) {
      $("#latin-table").innerHTML = table("大文字", window.LATIN_STROKES.upper) + table("小文字", window.LATIN_STROKES.lower);
    }
    $("#kana-table").innerHTML = table("ひらがな", K.hiragana) + table("カタカナ", K.katakana) +
      '<p class="small">濁点 +' + K.dakuten + "画、半濁点 +" + K.handakuten + "画、長音符「ー」" + K.chouon + "画、小さい字は元の字と同じ。</p>";
    $("#legend").innerHTML = [3, 2, 1, 0].map(function (n) {
      return "<li>" + starsHTML(n, "stars-small") + "<span>" + STAR_LABELS[n] + "</span></li>";
    }).join("");
  }
  function renderAbout() {
    var counts = [0, 0, 0, 0];
    state.data.forEach(function (r) { counts[r.stars]++; });
    $("#data-status").textContent = "読み込み元：" + state.dataSource + "／" + state.data.size + "件（星3：" + counts[3] + "件・星2：" + counts[2] + "件・星1：" + counts[1] + "件・星0：" + counts[0] + "件）";
    var rows = "";
    for (var k = 1; k <= MAX_KAKUSU; k++) {
      var r = state.data.get(k);
      rows += r ? '<tr><td class="n">' + k + "画</td><td>" + starsHTML(r.stars, "stars-small") + "</td><td>" + esc(r.keyword) + "</td><td>" + esc(r.basis) + "</td></tr>"
               : '<tr><td class="n">' + k + '画</td><td colspan="3">データなし</td></tr>';
    }
    $("#data-table").innerHTML = "<table><thead><tr><th>画数</th><th>星</th><th>キーワード</th><th>判定根拠</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }

  renderStatic();
  loadData();
})();
