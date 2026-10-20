#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
產生繁體鍵的英文釋義表（P0-B 的離線資料前置）。

輸入（唯讀，不修改任何來源檔）：
  desktop/example/qingjian-main/assets/glossary/glossary-en.tsv   簡體鍵，中→英
  desktop/example/opencc-v1.4.2-resources/*.txt                 OpenCC 純文字詞典

輸出（UTF-8 無 BOM、LF 換行）：
  desktop-temp/data/glossary-en-TW.tsv    繁體鍵\t英文1[\t英文2...]
  desktop-temp/data/audit-sample.txt      100 筆人工抽查樣本

轉換方向是「簡體 → 台灣繁體」（OpenCC s2twp），不是反過來。
理由：輸入是乾淨的 TSV，不需要解析 desktop/data/database.data 的 trie 結構，
      而且 s2twp 連詞彙差異都對（软件→軟體、屏幕→螢幕、网络→網路、程序→程式）。
"""

import io
import os
import random
import sys
from collections import Counter

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = os.path.join(REPO, "desktop", "example", "opencc-v1.4.2-resources")
GLOSSARY = os.path.join(REPO, "desktop", "example", "qingjian-main", "assets",
                        "glossary", "glossary-en.tsv")
OUT_TSV = os.path.join(REPO, "desktop-temp", "data", "glossary-en-TW.tsv")
OUT_SAMPLE = os.path.join(REPO, "desktop-temp", "data", "audit-sample.txt")

AUDIT_SEED = 20261020
AUDIT_SIZE = 100

# 台灣異體 / 罕用字。這些字在 glossary-en 的簡體鍵集合裡幾乎不會出現，
# 轉出來等於製造永遠查不到的條目。偵測到就退回「只轉簡繁、不套台灣用字」。
# 出處：Codex 實測 OpenCC 前向轉換會把 人才→人纔、頂針→顶鍼、高參→高蔘。
RARE_VARIANTS = set("纔鍼蔘羣囉覈麪裏")


def load_dict(filename):
    """讀 OpenCC 純文字詞典：key -> [候選值...]（空格分隔，取第一個為預設）。"""
    path = os.path.join(RES, filename)
    table = {}
    if not os.path.exists(path):
        return table
    with io.open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            if len(fields) < 2:
                continue
            values = [v for v in fields[1].split(" ") if v]
            if values:
                table[fields[0]] = values
    return table


def convert(text, stages):
    """貪婪最長匹配，逐 stage 套用。每個 stage 內先命中者贏（對應 short_circuit）。"""
    out = []
    index = 0
    while index < len(text):
        matched = None
        for table in stages:
            for length in range(min(len(text) - index, 16), 0, -1):
                hit = table.get(text[index:index + length])
                if hit:
                    matched = hit[0]
                    index += length
                    break
            if matched is not None:
                break
        if matched is None:
            out.append(text[index])
            index += 1
        else:
            out.append(matched)
    return "".join(out)


def main():
    for path, kind in ((RES, "dir"), (GLOSSARY, "file")):
        exists = os.path.isdir(path) if kind == "dir" else os.path.isfile(path)
        if not exists:
            print("找不到輸入（%s）：%s" % (kind, path))
            return 1

    normalize = load_dict("CJK_Compatibility_Ideographs.txt")
    s2t = [load_dict("STPhrases.txt"), load_dict("STCharacters.txt")]
    to_tw = [load_dict("TWPhrases.txt"),
             load_dict("TWVariantsPhrases.txt"),
             load_dict("TWVariants.txt")]

    def to_traditional(text):
        return convert(convert(text, [normalize]), s2t + to_tw)

    def to_traditional_conservative(text):
        """只用簡繁對應，跳過台灣用字轉換。"""
        return convert(convert(text, [normalize]), s2t)

    rows = {}
    stats = Counter()
    duplicates = 0

    with io.open(GLOSSARY, encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            key = fields[0].strip()
            if not key:
                continue
            senses = [f.replace("\t", " ").replace("\r", " ").strip()
                      for f in fields[1:]]
            senses = [s for s in senses if s][:2]   # 執行期最多顯示兩條
            if not senses:
                stats["no_sense"] += 1
                continue

            converted = to_traditional(key)
            if any(ch in RARE_VARIANTS for ch in converted):
                converted = to_traditional_conservative(key)
                stats["rare_fallback"] += 1

            stats["converted"] += 0 if converted == key else 1
            stats["total"] += 1

            # 同一個繁體鍵可能由多個簡體鍵轉出來（例：一對多）。保留義項較多者。
            existing = rows.get(converted)
            if existing is None:
                rows[converted] = (key, senses)
            else:
                duplicates += 1
                if len(senses) > len(existing[1]):
                    rows[converted] = (key, senses)

    # 排序輸出，避免 set / hash 順序造成不可重現的 diff
    ordered = sorted(rows.items(), key=lambda kv: kv[0])

    with io.open(OUT_TSV, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("# 由 desktop-temp/tools/build-glossary-tw.py 生成"
                     "（OpenCC 1.4.2 s2twp：簡體鍵 → 台灣繁體鍵）。"
                     "詞\\t英文1[\\t英文2]\n")
        for key, (_source, senses) in ordered:
            handle.write(key + "\t" + "\t".join(senses) + "\n")

    # 人工抽查樣本：固定 seed，且刻意混入高頻詞與隨機詞兩類
    sample_pool = list(ordered)
    random.seed(AUDIT_SEED)
    picked = random.sample(sample_pool, min(AUDIT_SIZE, len(sample_pool)))

    with io.open(OUT_SAMPLE, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("人工抽查樣本（%d 筆，seed=%d）\n" % (len(picked), AUDIT_SEED))
        handle.write("請逐筆確認英文譯義是否正確、多義取捨是否可接受。\n")
        handle.write("「簡體原鍵」欄僅供對照，執行期只會出現「繁體鍵」。\n")
        handle.write("=" * 78 + "\n")
        for index, (key, (source, senses)) in enumerate(picked, 1):
            handle.write("%3d. %s\n     簡體原鍵: %s\n     英文譯義: %s\n"
                         % (index, key, source, " / ".join(senses)))
        handle.write("=" * 78 + "\n")

    print("輸入條目      : %d" % stats["total"])
    print("鍵有變動      : %d (%.1f%%)" % (stats["converted"],
                                            100.0 * stats["converted"] / stats["total"]))
    print("罕用字退回    : %d" % stats["rare_fallback"])
    print("繁體鍵衝突    : %d" % duplicates)
    print("缺譯義跳過    : %d" % stats["no_sense"])
    print("輸出條目      : %d" % len(ordered))
    print("多義條目(2欄) : %d" % sum(1 for _k, (_s, v) in ordered if len(v) > 1))
    print()
    print("寫出 %s" % OUT_TSV)
    print("寫出 %s" % OUT_SAMPLE)
    return 0


if __name__ == "__main__":
    sys.exit(main())