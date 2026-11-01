# 乘法探索樂園 · Multiplication Playground

以彩色積木與互動數線，理解「每組幾顆 × 有幾組」和「每次加多少 × 跳幾次」之間的關係。

## 功能

- 積木與數線共用選取的算式，切換畫面時保留狀態。
- 用加減按鈕、滑桿或 1～9 乘法表調整顆數與組數。
- 可交換兩個因數，觀察總數不變、排列改變。
- 以直虛線分隔每 5 顆、橫虛線分隔每 5 組。
- 提供 ×0～10 的乘法表模式，以及 0～90 的倍數探索模式。
- 手機優先顯示積木操作區，乘法表可展開選題；窄螢幕的數線可用滑桿或箭頭移動。
- 支援鍵盤操作與減少動態效果的系統偏好。

## 開啟與維護

入口為 `index.html`。這是單一 HTML 靜態網站，CSS、JavaScript、SVG 均內嵌，沒有建置或外部套件需求。

直接使用 GitHub Pages 開啟本目錄即可。部署會沿用儲存庫既有的 Pages 設定；更新本目錄的 `index.html` 後，等待 Pages 部署完成即可。

## 設計參考

下列開源專案提供介面設計方向；本頁保留自己的積木造型與乘法互動。

- [ScratchJr 的圖像工具列](https://github.com/scratchfoundation/scratchjr/blob/develop/src/editor/ui/Palette.js)：圖像分類與清楚的選取狀態。
- [GCompris 的控制按鈕](https://github.com/KDE/gcompris/blob/master/src/core/ControlButton.qml)：可觸控的操作範圍與按壓回饋。
- [Blockly Games 的共用樣式](https://github.com/blockly-games/blockly-games/blob/master/appengine/common/common.css)：主要與次要按鈕的視覺層級。
