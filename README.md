# Ryan 的小作品

這是一個以 GitHub Pages 發佈的個人作品集，收錄互動小工具、網頁實驗與學習筆記。

## 作品入口

| 類型 | 作品 | 連結 |
| --- | --- | --- |
| 抽籤工具 | CSK 抽籤器（新版） | [開啟](CSK_drawer2/) |
| 抽籤工具 | CSK 抽籤器（舊版） | [開啟](CSK_drawer/) |
| 小遊戲 | 點擊目標 | [開啟](clicking_game/) |
| 抽選工具 | Gacha Name Picking | [開啟](GachaName%20PickingV2/gacha.html) |
| 互動實驗 | IR／序列埠實驗 | [開啟](IR/) |
| ML 實驗 | Teachable Machine Tester | [開啟](TeachableMachineTester.html) |
| 視覺實驗 | Neon Math Sound | [開啟](neon_math_sound.html) |
| 學習筆記 | Python 編程（二級） | [閱讀](Python%E7%BC%96%E7%A8%8B%EF%BC%88%E4%BA%8C%E7%BA%A7%EF%BC%89.md) |

## 目前目錄

```text
.
├── index.html                         # 作品集首頁與導覽
├── CSK_drawer2/                       # CSK 抽籤器（目前版本）
├── CSK_drawer/                        # CSK 抽籤器（舊版）
├── clicking_game/                     # 點擊目標小遊戲
├── GachaName PickingV2/               # 名稱隨機抽選工具與音效
├── IR/                                # p5.js／序列埠互動實驗
├── image/                             # 圖片資產
├── md/                                # Markdown 筆記
├── Fusion 360 的介面及設定 .../       # Fusion 360 文件圖片
└── *.html、*.md                       # 獨立實驗與筆記
```

## 維護原則

- 新作品請優先放在獨立資料夾，資料夾內以 `index.html` 作為入口。
- 在首頁與本 README 新增作品連結和一句用途說明。
- 不直接搬動既有檔案或資料夾：它們可能已有 GitHub Pages 或外部連結。若要重整，可先建立新路徑，再保留舊路徑的導向頁。
- 避免在根目錄新增未分類檔案；圖片放 `image/`，Markdown 筆記放 `md/`。

## 後續整理建議

下一個安全的重構階段可建立 `projects/`、`experiments/`、`notes/` 與 `assets/`；搬遷時為每個舊網址保留重新導向頁，避免失效連結。
