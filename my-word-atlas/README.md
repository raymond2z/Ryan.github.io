# My Word Atlas V1 · 個人化單字學習原型

這是一個獨立的、可直接放到 GitHub Pages 的 **V1 原型**，使用 Word Atlas 的資料結構理念，但 **不是原專案的 React Fork**，也尚未移植其星圖、插畫及原聲音素材。

## 開始使用

- 線上版：`https://raymond2z.github.io/Ryan.github.io/my-word-atlas/`
- 單檔版：直接開啟 `single-file-v1.html`；所有基本功能可在單檔中執行，語音使用瀏覽器 TTS。
- 模組開發版：在本目錄執行 `python -m http.server 8000`，然後開啟 `http://localhost:8000/`。
- 測試：`node --test tests/core.test.mjs`（Node.js 20+）。

## 已實作

- 內建 30 個經整理的 IELTS Academic 初版示範詞卡。
- 自行新增詞庫、編輯／刪除單字、搜尋、切換詞庫。
- 匯入 JSON（支援 Word Atlas 的詞條格式）或 CSV，匯出 CSV，另有完整學習紀錄 JSON 備份／還原。
- 每天最多 5 個新字；到期複習優先；未到期字不會因為較弱而重複佔用選字額度。
- 新字三階段：**看字理解 → 首字母有提示回想 → 無提示拼字**。
- 獨立拼字三級提示：首字母、首尾字母、打亂字母。強提示會按 Again 記錄，避免高估記憶。
- 第一次有效回想才影響排程；錯誤後要求輸入一次正確拼法，重打不再二次推進記憶間隔。
- 提供簡單學習統計；各詞庫獨立保存進度。

## FSRS 排程

採用 Word Atlas 同主要版本的 `ts-fsrs@5.4.2`（由 esm.sh 的 ES Module CDN 取得），並設定 FSRS-6、目標記憶率 90%。**需能連上 CDN 才能使用真正的 FSRS**；若無法連接，會使用保守的本機基本排程（V1 的退化模式），並在介面上明確標示。歷史回想紀錄保留，連線後可重放用於 FSRS 計算。這不等同於完整的離線 FSRS 打包版。

## 注意事項

- 學習資料儲存在目前瀏覽器的 `localStorage`。清除瀏覽資料、使用無痕模式、不同裝置切換都可能遺失或不共享進度。請定期匯出備份。
- V1 沒有登入、跨設備同步、教師帳號或學生數據伺服器；這些需要後續設計。
- V1 每次匯入最多 500 字，檔案不得超過 5MB；完整 Word Atlas 7,298 字應於下一階段改用 IndexedDB 和按需載入，不宜一次塞進 localStorage。
- V1 不會讀取或覆蓋「極光單字冒險島 V4.7」的記錄，避免資料意外混用。未來可提供明確的匯入／轉換工具。
- 例句和單字資料供學習原型測試；正式用於教學前建議由教師審核。
- 這份實作和原作者的 React 專案不同。若之後建立正式 Fork，請遵守 MIT 程式碼授權，及引用 Word Atlas 詞庫／媒體時的 CC BY 4.0 署名條款。

## CSV 格式

```csv
word,zh,pos,definition,example,exampleZh,collocations,cefr,topic
resilient,有韌性的,adj.,able to recover after difficulty,The town recovered after the storm.,風暴後小鎮復原了,resilient community,B2,society
```

## 下一步

1. 將這個原型的詞庫編輯器、每日學習和回想證據邏輯移植至正式 Word Atlas 的 React/TypeScript 架構。
2. 完成本地打包的 `ts-fsrs`，改用 IndexedDB，強化離線學習可靠性。
3. 加入圖片、例句、搭配詞的內容審核狀態及正式 UI。
4. 進行實機互動測試、資料還原與跨日回歸測試。

## 致謝與授權

參考 [Word Atlas](https://github.com/designfuchen/word-atlas)（原專案程式碼：MIT；詞庫、插畫、錄音：CC BY 4.0）。此 V1 沒有直接打包其圖片或錄音。若後續使用其內容，請署名 **Word Atlas contributors — CC BY 4.0**，附授權連結並說明修改。