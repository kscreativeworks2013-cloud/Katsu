# spec-docs

`docs/spec/*.md` を PDF / Word / PowerPoint に書き出すツール。**アプリ本体（`src/`）とは完全に分離**しており、
このツールを実行してもアプリのビルド成果物には影響しない。逆にアプリ側からこのツールを呼ぶこともない。

```bash
pip install -r tools/spec-docs/requirements.txt
python tools/spec-docs/build_spec_docs.py            # dist/spec-docs/ に出力
python tools/spec-docs/build_spec_docs.py ./somewhere # 出力先を指定
```

## 入力の書式

- `docs/spec/` の Markdown を**ファイル名順**に読み、1ファイル＝1セクションとして扱う。
- 1行目の `# 見出し` がセクション見出し、以降が本文。
- 本文は空行で段落に分かれる。
- 同じ本文を PDF・Word・PowerPoint の3形式へ流し込むため、**強調・表・リスト記法は使わない**。
  箇条書きは仕様書本文と同じく `・` を行頭に置く。

## 出力

| 形式 | ファイル名                                     |
| ---- | ---------------------------------------------- |
| PDF  | `Luxury_Beauty_Visual_Proposal_OS_仕様書.pdf`  |
| Word | `Luxury_Beauty_Visual_Proposal_OS_仕様書.docx` |
| PPTX | `Luxury_Beauty_Visual_Proposal_OS_仕様書.pptx` |

出力先の `dist/` は `.gitignore` 済み。生成物はコミットせず、必要なときに再生成する。

## 日本語まわりの注意

3点は環境差で崩れやすいため、変更するときは実際に出力を開いて確認すること。

- **PDF**: 本文スタイルに `wordWrap="CJK"` が必要。ないと日本語が単語単位で折り返され、行末が版面からはみ出す。
- **Word**: `w:eastAsia` に和文フォントを設定する。標準スタイルのままだと環境によって代替フォントに落ちる。
- **PowerPoint**: プレースホルダの高さを超えると文字が枠外に溢れる。`PPTX_LINES_PER_SLIDE` 行ごとにスライドを分割している。
