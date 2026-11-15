# 使用データの出典・ライセンス一覧

みこぷらん 画数診断で使用している外部データと、その扱いの一覧です。

| データ | 使用ファイル | 出典 | ライセンス |
|---|---|---|---|
| 漢字の画数 | `data/kanji-strokes.js` | KANJIDIC2（Electronic Dictionary Research and Development Group） | CC BY-SA 4.0 |
| 新字体・旧字体の対応 | `data/kyujitai-map.js` | kyujitai.js 1.3.0（hakatashi） | MIT License |
| 互換漢字の対応 | （実行時に計算） | Unicode 正準分解（CJK互換漢字→統合漢字） | Unicode License |
| ひらがなの画数 | `data/kana-strokes.js` | 伝統的な姓名判断の画数表（複数の姓名判断サイトの方式を参考） | みこぷらん採用 |
| カタカナの画数 | `data/kana-strokes.js` | みこぷらん採用ルール（教科書体の画数） | 自作 |
| 英字の画数 | `data/latin-strokes.js` | みこぷらん採用ルール（ブロック体の線のまとまり） | 自作 |
| 81数理の診断データ | `data/mikoplan_81_kakusu.csv` | みこぷらん独自構成（暫定版） | みこぷらん |

---

## 1. KANJIDIC2（漢字の画数）

- 権利者：© Electronic Dictionary Research and Development Group（EDRDG）
- プロジェクト：https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
- ライセンス：Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）
  - EDRDG ライセンス文書：https://www.edrdg.org/edrdg/licence.html
  - CC BY-SA 4.0：https://creativecommons.org/licenses/by-sa/4.0/
- 取得経路：npm パッケージ `kanjidic2-json` 0.1.0（2025年4月公開、MIT License。KANJIDIC2 XML を JSON に変換したもの）
- 使用した項目：各漢字の `stroke_count` の**先頭の値**（KANJIDIC2 では先頭が正しい画数、2つ目以降はよくある数え間違いとして記録されています）
- 対応範囲：13,108字（JIS X 0208・JIS X 0212・JIS X 0213 の漢字。常用漢字・人名用漢字を含む）
- 未対応の例：髙（はしご高）・𠮷（つちよし）など、上記に含まれない一部の異体字

### 表示義務について（重要）
`data/kanji-strokes.js` は KANJIDIC2 の派生データのため、**CC BY-SA 4.0 で提供する必要があります**。
アプリ内「資料」画面に出典とライセンスを表示しています。この表示は削除しないでください。
なお、アプリ本体のプログラム（HTML・CSS・JavaScript）や診断文章にまで CC BY-SA が及ぶものではありません。

## 2. kyujitai.js（新字体・旧字体の対応表）

- 権利者：© hakatashi
- リポジトリ：https://github.com/hakatashi/kyujitai.js
- ライセンス：MIT License
- 使い方：kyujitai.js の対応表（773組）のうち、次の条件を満たす **307組だけ**を自動変換に使用しています。
  1. 新字体と旧字体が別の文字コードである
  2. 両方の字が KANJIDIC2 に収録されている（画数を確認できる）
  3. KANJIDIC2 の異体字情報で、互いに異体字として参照されている
- 自動変換から外したもの
  - 旧字体の画数を KANJIDIC2 で確認できない 22組（例：教→敎、清→淸、青→靑）→ 旧字体モードでは「確認できません」と表示
  - 意味によって旧字体が異なる 10字（余・欠・糸・芸・虫・缶・台・証・弁・予）→ 旧字体モードでは計算しない
  - 常用漢字表・人名用漢字表で旧字体として扱われない異体字関係 12字（回・冴・凜・萌・鎌・刃・妊・糾・隣・携・亘・粘）

```
MIT License
Copyright (c) hakatashi
Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
```

## 3. Unicode CJK互換漢字

社・器 などの「旧字体の字形」を表す CJK互換漢字のうち、KANJIDIC2 に画数がある 67字は、Unicode の正準分解で元の字に対応づけ、旧字体モードでその字形の画数を使います（例：社 7画 → 社 8画）。

## 4. 画数辞書で対応できていない範囲（まとめ）

- KANJIDIC2 未収録の漢字（一部の異体字・外字）
- 旧字体モードでの 22組（旧字体の画数データなし）と 10字（意味により旧字体が異なる）
- 字形の細部だけが違う旧字体（例：平・成など 約420字）は、同じ文字コードのため区別できません。辞書の画数で計算し、注意書きを表示します。
- 部首を元の字で数える方式（氵＝水4画、艹＝艸6画、阝＝阜8画/邑7画 など）は未採用
- 数字・記号（統一基準がないため未対応）
- アクセント記号つきの英字（é など）
- 英字は伝統的な統一基準がないため、みこぷらん独自の採用ルールで計算しています
- ゐ・ゑ・ヰ・ヱ・ゝ・ゞ・ヽ・ヾ
