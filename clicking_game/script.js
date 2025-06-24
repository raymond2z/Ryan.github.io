// 獲取需要的 HTML 元素
const gameContainer = document.getElementById('game-container');
const target = document.getElementById('target');
const scoreDisplay = document.getElementById('score');

// 初始化分數
let score = 0;

// 更新分數顯示的函數
function updateScore() {
    scoreDisplay.textContent = score;
}

// 移動目標到隨機位置的函數
function moveTarget() {
    // 獲取遊戲容器的尺寸
    const containerWidth = gameContainer.clientWidth;
    const containerHeight = gameContainer.clientHeight;

    // 獲取目標的尺寸
    const targetWidth = target.offsetWidth;
    const targetHeight = target.offsetHeight;

    // 計算可以放置目標的最大 x 和 y 座標
    const maxX = containerWidth - targetWidth;
    const maxY = containerHeight - targetHeight;

    // 產生隨機座標 (0 到 maxX/maxY 之間)
    const randomX = Math.floor(Math.random() * maxX);
    const randomY = Math.floor(Math.random() * maxY);

    // 設定目標的新位置 (記得加上 'px')
    target.style.left = randomX + 'px';
    target.style.top = randomY + 'px';
}

// 創建火花的函數
function createSparks(x, y) {
    const sparkCount = 8; // 想要創建多少個火花
    const sparkSpread = 70; // 火花擴散的最大距離 (像素)

    for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement('div');
        spark.classList.add('spark');

        // 設定火花的初始位置 (傳入的 x, y 應該是中心點)
        // 減去火花自身寬度/高度的一半，使其中心對準 (x, y)
        const sparkSize = 8; // 和 CSS 中定義的 width/height 一致
        spark.style.left = (x - sparkSize / 2) + 'px';
        spark.style.top = (y - sparkSize / 2) + 'px';

        // 計算隨機的最終位移 (tx, ty)
        const randomAngle = Math.random() * Math.PI * 2; // 隨機角度 (0 到 2π)
        const randomDistance = Math.random() * sparkSpread; // 隨機距離 (0 到 sparkSpread)
        const tx = Math.cos(randomAngle) * randomDistance;
        const ty = Math.sin(randomAngle) * randomDistance;

        // 設定 CSS 自訂屬性，供 @keyframes 使用
        spark.style.setProperty('--tx', `${tx}px`);
        spark.style.setProperty('--ty', `${ty}px`);

        // 將火花添加到遊戲容器中
        gameContainer.appendChild(spark);

        // **重要**: 監聽動畫結束事件，結束後移除火花元素
        spark.addEventListener('animationend', () => {
            // 檢查父節點是否存在，更安全地移除
             if (spark.parentNode === gameContainer) {
                gameContainer.removeChild(spark);
            }
        }, { once: true }); // 使用 { once: true } 選項確保監聽器只觸發一次後自動移除
    }
}


// 當目標被點擊時執行的函數
function targetClicked(event) { // 接收 event 對象
    // 分數增加
    score++;
    // 更新分數顯示
    updateScore();

    // --- 特效 ---
    // 1. 原來的縮放特效
    target.classList.add('clicked-effect');
    setTimeout(() => {
        target.classList.remove('clicked-effect');
    }, 100); // 效果持續時間應小於或等於 CSS transition 時間

    // 2. 觸發火花特效
    // 計算目標在容器內的中心點 (在它移動之前！)
    // offsetLeft/Top 是相對於 offsetParent (這裡是 gameContainer) 的位置
    const targetCenterX = target.offsetLeft + target.offsetWidth / 2;
    const targetCenterY = target.offsetTop + target.offsetHeight / 2;

    // 在目標中心點創建火花
    createSparks(targetCenterX, targetCenterY);

    // 移動目標到新位置 (可以稍微延遲，讓火花先出來)
    // 延遲時間可以根據喜好調整
    setTimeout(moveTarget, 50);
}

// --- 遊戲初始化 ---

// 為目標添加點擊事件監聽器
target.addEventListener('click', targetClicked);

// 遊戲開始時，先移動一次目標到隨機位置
moveTarget();

// 初始化分數顯示
updateScore();