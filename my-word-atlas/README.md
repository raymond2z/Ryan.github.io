# My Word Atlas V1.3 · 個人化單字圖鑑

**線上版**：https://raymond2z.github.io/Ryan.github.io/my-word-atlas/

這是根據 [Word Atlas](https://github.com/designfuchen/word-atlas) 資料結構與學習理念建立的獨立原型；**尚非 Word Atlas React 原始碼的正式 Fork**。原有單字學習進度沿用 `localStorage` 的 `my-word-atlas-v1:state`，更新不會主動清除既有紀錄。

## V1.3 新功能

- **Vocabulary Constellation**：輕量 SVG 單字星圖，按主題分佈、可搜尋、篩選未學／到期／學習中／較穩定字；每個星點可用滑鼠或鍵盤開啟詞卡。此功能不是原版 Word Atlas WebGL 星圖。
- **Word Atlas 參考媒體**：30 個內建 IELTS 詞卡可按原詞 ID 嘗試載入 Word Atlas 縮圖與英式／美式音檔。外部資源不可用時顯示圖片回退介面，發音自動回退到瀏覽器 TTS。不能保證每個字都含有相符的圖片或音檔。
- **自訂媒體**：單字編輯器增加圖片網址、UK／US 音檔網址、是否允許使用 Word Atlas 參考媒體。只接受 HTTPS 完整 URL。
- **個人偏好**：首頁可關閉外部素材載入、選擇 UK／US。當外部素材關閉時，保留瀏覽器朗讀功能。
- **修正**：朗讀函數不會再錯把整個詞卡物件當文字朗讀。
- **向後兼容**：已有 IELTS Starter 30 和學習紀錄會保留，舊詞卡補上可選的參考媒體標記；其他自建詞庫不自動接上外部素材。

## 既有功能保持不變

- 30 個 IELTS Academic 示範字；自訂多詞庫；新增／編輯／刪除單字；CSV／JSON 匯入及 CSV 匯出。
- 三階段：接觸 → 有提示回想 → 無提示回想；到期才正常複習，避免未到期舊字佔用新字配額。
- 三級拼字提示、答錯後重打。只在一次有效的獨立回想時推進排程。
- 備份／還原、基本學習統計及每詞庫獨立進度。
- FSRS 使用 `ts-fsrs@5.4.2` 的外部 ES Module；若 CDN 無法載入，保留 fallback。**尚未完成本地完全離線打包的 FSRS**。

## 使用方式

- **直接開啟** `My_Word_Atlas_V1_2.html`（單檔版；無需伺服器）。
- **模組開發**：本目錄執行 `python -m http.server 8000` 後造訪 http://localhost:8000/ ，讀取 `index.html`。這個版本以 ES Modules 分離核心、媒體、星圖和 UI 邏輯。
- **測試**：Node.js 20+，執行 `node --test tests/*.test.mjs`，目前 13 項測試通過。

## 資料安全

- 資料只存於瀏覽器 localStorage。不同瀏覽器／設備不會自動同步。建議升級前先使用「學習紀錄 → 匯出完整備份」下載 JSON。
- V1.3 不會覆蓋極光單字冒險島 V4.7 的原有資料。自訂詞庫同時使用 `word + meaning + id`，請勿任意改動已有字詞的唯一 ID。
- 開啟外部媒體時，瀏覽器會向 Word Atlas 或自訂 HTTPS 媒體來源發起連線；可在首頁關閉。
- Word Atlas 媒體只作參考情境，可能代表不同詞義；正式教材請人工確認內容與授權。

## 授權／致謝

- 開源專案：[Word Atlas](https://github.com/designfuchen/word-atlas)，原專案程式碼 MIT。
- 使用之 Word Atlas 參考圖像與錄音：**Word Atlas contributors — CC BY 4.0**；授權條款 https://creativecommons.org/licenses/by/4.0/ 。此版重新整合於自製學習介面；並非官方 Word Atlas 網站或受其背書。
- 自訂圖片／音檔的使用授權由上傳或設定者自行確認。

## 後續工作

1. 將目前已測試的詞庫編輯器、學習流程和星圖 UI 分階段搬至 Word Atlas React + TypeScript 正式分支（尚未建立 Fork）。
2. 本地打包 ts-fsrs；擴充 IndexedDB，大詞庫按需載入。
3. 教材審核狀態與內容出處；更高品質的例句與搭配詞學習。
4. 實機回歸、跨日排程、資料損壞恢復及跨設備同步方案。