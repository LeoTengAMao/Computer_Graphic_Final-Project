// game.js
const GameState = {
    time: 0,
    obMode: true, // 預設開啟 OB 模式，按 'O' 鍵可以切換
    
    // OB 攝影機狀態
    obCam: { x: 0, y: 15, z: 20, pitch: -30, yaw: 0 }, 
    
    // 紀錄鍵盤按下的狀態
    keys: { w: false, a: false, s: false, d: false, q: false, e: false } 
};

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 讓按鈕不要報錯 (先給空功能)
function setupUI() {
    document.getElementById('btn-door-left').onclick = () => console.log("門按鈕被點擊");
    document.getElementById('btn-light-left').onclick = () => console.log("燈按鈕被點擊");
    document.getElementById('btn-monitor').onclick = () => console.log("監視器被點擊");
}

function setupInput() {
    // 鍵盤按下與放開事件
    window.addEventListener('keydown', (ev) => {
        let k = ev.key.toLowerCase();
        if (GameState.keys.hasOwnProperty(k)) GameState.keys[k] = true;
        if (k === 'o') {
            GameState.obMode = !GameState.obMode; // 切換 OB 模式
            console.log("OB Mode:", GameState.obMode ? "ON" : "OFF");
        }
    });

    window.addEventListener('keyup', (ev) => {
        let k = ev.key.toLowerCase();
        if (GameState.keys.hasOwnProperty(k)) GameState.keys[k] = false;
    });

    // 滑鼠拖曳轉動視角 (只有在 OB 模式且按住左鍵時有效)
    window.addEventListener('mousedown', (ev) => {
        isDragging = true;
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
    });

    window.addEventListener('mouseup', () => isDragging = false);

    window.addEventListener('mousemove', (ev) => {
        if (!isDragging || !GameState.obMode) return;
        
        let dx = ev.clientX - lastMouseX;
        let dy = ev.clientY - lastMouseY;
        
        GameState.obCam.yaw -= dx * 0.2; // 左右看
        GameState.obCam.pitch -= dy * 0.2; // 上下看
        
        // 限制上下看的角度，避免脖子斷掉
        GameState.obCam.pitch = Math.max(-89, Math.min(89, GameState.obCam.pitch));
        
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
    });
}

function updateLogic() {
    GameState.time += 0.01;

    // OB 模式下的飛行控制
    if (GameState.obMode) {
        let speed = 0.2;
        let yawRad = GameState.obCam.yaw * Math.PI / 180;

        // 計算相對於攝影機視角的「前方」與「右方」向量
        let forwardX = Math.sin(yawRad);
        let forwardZ = -Math.cos(yawRad);
        let rightX = Math.cos(yawRad);
        let rightZ = Math.sin(yawRad);

        if (GameState.keys.w) { GameState.obCam.x += forwardX * speed; GameState.obCam.z += forwardZ * speed; }
        if (GameState.keys.s) { GameState.obCam.x -= forwardX * speed; GameState.obCam.z -= forwardZ * speed; }
        if (GameState.keys.a) { GameState.obCam.x -= rightX * speed; GameState.obCam.z -= rightZ * speed; }
        if (GameState.keys.d) { GameState.obCam.x += rightX * speed; GameState.obCam.z += rightZ * speed; }
        
        // Q 鍵下降，E 鍵上升
        if (GameState.keys.e) { GameState.obCam.y += speed; }
        if (GameState.keys.q) { GameState.obCam.y -= speed; }
    }
}


function gameLoop() {
    updateLogic();
    Renderer.draw(GameState);
    requestAnimationFrame(gameLoop);
}

window.onload = () => {
    setupInput();
    if (Renderer.init('webgl-canvas')) {
        gameLoop();
    }
};