// game.js
const GameState = {
    time: 0 // 記錄遊戲運行了多久
};

// 讓按鈕不要報錯 (先給空功能)
function setupUI() {
    document.getElementById('btn-door-left').onclick = () => console.log("門按鈕被點擊");
    document.getElementById('btn-light-left').onclick = () => console.log("燈按鈕被點擊");
    document.getElementById('btn-monitor').onclick = () => console.log("監視器被點擊");
}

function gameLoop() {
    // 每次更新時間，讓方塊旋轉
    GameState.time += 0.01;

    // 呼叫 WebGL.js 裡面的畫家來畫圖
    Renderer.draw(GameState);

    requestAnimationFrame(gameLoop);
}

window.onload = () => {
    setupUI();
    
    // 如果 Renderer 初始化成功，就開始遊戲迴圈
    if (Renderer.init('webgl-canvas')) {
        gameLoop();
    }
};