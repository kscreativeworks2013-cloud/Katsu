#!/usr/bin/env python3
"""
和文フォントの事前サブセット化（第9章 工程00-b）。

pdf-lib の実行時サブセット化は字形の集合によって壊れた glyf を吐き、出力側から
検知できない（実測：47字中38字の輪郭が欠落）。文字化けした提案書をクライアントへ
渡す事故を避けるため、**絞り込みはここで一度だけ行い、実行時は絞らずに埋め込む**。

収録する字形集合は JIS X 0208（第1・第2水準）を基礎に、実案件で現れうる分を足す。
JIS X 0213（第3・第4水準）まで広げる案は実測で退けた：

    JIS X 0208 ＋ 欧文・記号   指定 10,023 字   生 2.35MB   Flate後 1.36MB
    JIS X 0213 ＋ 欧文・記号   指定 16,881 字   生 4.63MB   Flate後 2.68MB
    CJK統合漢字を丸ごと        指定 31,104 字   生 4.52MB   Flate後 2.61MB
    （絞らない現行）                             生 5.22MB   Flate後 3.01MB

第3・第4水準まで入れると削減が 1.65MB → 0.33MB になり、軽量化の意味が消える。
足りない字は**出力時に検知して列挙する**（pdfLayout の missingGlyphs）ので、
黙って落ちることはない。取りこぼしはその都度この集合へ足す。

生成物は src/assets/fonts/ に置いてコミットする。ビルド時に生成しない理由は、
生成に Python と fontTools が要り、それをビルドの必須条件にしたくないため。
集合を変えたら `npm run fonts:subset` を実行し、生成物ごとコミットする。
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(
    ROOT, 'node_modules/@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf'
)
OUT = os.path.join(ROOT, 'src/assets/fonts/NotoSansJP-jis.ttf')
# 生成の素性。コミットされた実体が本当にこのスクリプトの出力かを、あとから照合する。
MANIFEST = os.path.join(ROOT, 'src/assets/fonts/NotoSansJP-jis.json')

# 欧文・記号。ブランド名の欧文（Ō Œ Š）、英文の約物（– — ‚ „ • ‹ ›）、
# 通貨・単位・丸数字・チェック記号まで含める。
RANGES = [
    (0x0020, 0x024F),  # ASCII／Latin-1 補助／Latin Extended-A・B
    (0x02B0, 0x02FF),  # 修飾文字
    (0x2000, 0x206F),  # 一般句読点
    (0x20A0, 0x20BF),  # 通貨記号
    (0x2100, 0x214F),  # 文字様記号（™ ℉）
    (0x2150, 0x218F),  # 数字に準じるもの
    (0x2190, 0x21FF),  # 矢印
    (0x2200, 0x22FF),  # 数学記号
    (0x2460, 0x24FF),  # 囲み英数字（丸数字）
    (0x25A0, 0x25FF),  # 幾何学模様
    (0x2600, 0x27BF),  # その他の記号・装飾記号（✓）
    (0x3000, 0x30FF),  # CJK 記号・ひらがな・カタカナ
    (0x3200, 0x33FF),  # CJK 互換（㎡ ㎜ ㈱ ℡）
    (0xF900, 0xFAFF),  # CJK 互換漢字（﨑 など人名の異体字）
    (0xFF00, 0xFFEF),  # 半角・全角
]

# JIS X 0208 にも上の範囲にも入らないが、人名・社名で現れるもの。
# 取りこぼしは出力時の検知で分かるので、分かった時点でここへ足す。
EXTRA_CHARS = '髙德濵嶋曾邊邉栁𠮷'


def jis_x_0208() -> set:
    """Shift_JIS で往復できる符号位置＝JIS X 0208（第1・第2水準＋かな＋記号）。"""
    found = set()
    for code in range(0x20, 0x10000):
        char = chr(code)
        try:
            if char.encode('shift_jis').decode('shift_jis') == char:
                found.add(code)
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return found


def code_points() -> set:
    points = jis_x_0208()
    for start, end in RANGES:
        points |= set(range(start, end + 1))
    points |= {ord(char) for char in EXTRA_CHARS}
    return points


def sha256_of(path: str) -> str:
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def points_digest(points: set) -> str:
    """符号位置の集合そのものの指紋。集合を触ったかどうかがこれで分かる。"""
    listing = ','.join(f'U+{code:04X}' for code in sorted(points))
    return hashlib.sha256(listing.encode('utf-8')).hexdigest()


def generate(points: set, out_path: str) -> None:
    listing = out_path + '.unicodes.txt'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(listing, 'w', encoding='utf-8') as handle:
        handle.write(','.join(f'U+{code:04X}' for code in sorted(points)))

    try:
        subprocess.run(
            [
                'pyftsubset',
                SRC,
                f'--unicodes-file={listing}',
                f'--output-file={out_path}',
                # 縦組みも合字も使っていない。OpenType 機能は落として字形だけ残す。
                '--layout-features=',
                '--no-hinting',
                '--desubroutinize',
                '--drop-tables+=DSIG',
            ],
            check=True,
        )
    finally:
        os.remove(listing)


def write_manifest(points: set) -> dict:
    """
    生成の素性を書き残す（第9章 工程00-b-1）。

    ・`output` はコミット済みの実体と突き合わせる。手で置き換わった／壊れた／
      部分的にコミットされた、を **Python 無しのテスト**で捕まえられる。
    ・`codePoints` は集合そのものの指紋。集合を編集して再生成を忘れた経路は、
      これを再計算しないと分からない（`--check` が担当する）。
    """
    manifest = {
        'source': os.path.relpath(SRC, ROOT),
        'sourceSha256': sha256_of(SRC),
        'codePointCount': len(points),
        'codePointsSha256': points_digest(points),
        'outputBytes': os.path.getsize(OUT),
        'outputSha256': sha256_of(OUT),
        'extraChars': EXTRA_CHARS,
    }
    with open(MANIFEST, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    return manifest


def check(points: set) -> int:
    """再生成して、コミット済みの実体と一致するかを見る。ビルドの必須条件にはしない。"""
    if not os.path.exists(OUT) or not os.path.exists(MANIFEST):
        print('生成物かマニフェストがありません。`npm run fonts:subset` を実行してください。', file=sys.stderr)
        return 1

    with open(MANIFEST, encoding='utf-8') as handle:
        recorded = json.load(handle)

    problems = []
    if recorded.get('codePointsSha256') != points_digest(points):
        problems.append(
            '字形集合が subset.py の現在の定義と一致しません'
            f'（記録 {recorded.get("codePointCount")} 符号位置／現在 {len(points)}）。'
        )
    if recorded.get('sourceSha256') != sha256_of(SRC):
        problems.append('元のフォントが記録時と異なります（npm の版が上がった可能性）。')
    if recorded.get('outputSha256') != sha256_of(OUT):
        problems.append('コミットされた実体がマニフェストの記録と一致しません。')

    with tempfile.TemporaryDirectory() as work:
        fresh = os.path.join(work, 'fresh.ttf')
        generate(points, fresh)
        if sha256_of(fresh) != sha256_of(OUT):
            problems.append('再生成した実体がコミット済みのものと一致しません。')

    if problems:
        for problem in problems:
            print(f'× {problem}', file=sys.stderr)
        print('`npm run fonts:subset` で作り直し、生成物ごとコミットしてください。', file=sys.stderr)
        return 1

    print(f'一致（{recorded["codePointCount"]:,} 符号位置／{recorded["outputBytes"]:,} バイト）')
    return 0


def main() -> int:
    if not os.path.exists(SRC):
        print(f'元のフォントが見つかりません: {SRC}', file=sys.stderr)
        return 1
    if shutil.which('pyftsubset') is None:
        print('pyftsubset がありません（pip install fonttools）。', file=sys.stderr)
        return 1

    points = code_points()
    if '--check' in sys.argv:
        return check(points)

    generate(points, OUT)
    manifest = write_manifest(points)

    before = os.path.getsize(SRC)
    print(f'指定 {len(points):,} 符号位置')
    print(f'{before:,} バイト → {manifest["outputBytes"]:,} バイト（{manifest["outputBytes"] / before:.0%}）')
    print(f'SHA-256 {manifest["outputSha256"]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
