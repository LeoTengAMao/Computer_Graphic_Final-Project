// game.js
const GameState = {
    time: 0,
    obMode: false, // 預設開啟 OB 模式，按 'O' 鍵可以切換
    
    // OB 攝影機狀態
    obCam: { x: 0, y: 15, z: 20, pitch: -30, yaw: 0 }, 
    
    // 紀錄鍵盤按下的狀態
    keys: { w: false, a: false, s: false, d: false, Space: false, shift: false }, // 🌟 修復1：這裡補上逗號了！
    
    guardYaw: 0,        // 目前實際角度
    targetGuardYaw: 0,  // 滑鼠希望轉到的目標角度 (-90 到 90)   

    // 🌟 遊戲核心狀態
    power: 100.0,          // 剩餘電量
    usage: 1,              // 當前耗電等級 (1格預設)
    isMonitorOpen: false,  // 監視器是否打開
    currentCam: 'cam1',    // 目前看哪台攝影機
    leftDoorClosed: false, // 左門
    leftLightOn: false,    // 左燈
    leftDoorY: 5.0,
    rightDoorClosed: false,
    rightLightOn: false,
    rightDoorY: 5.0, // 右門的物理高度
    // 🌟 新增：專屬頻道的干擾系統
    flickerTimer: 0,     
    flickerCams: [],

    bonnie: {
        location: 'cam1', // 一開始在主舞台
        timer: 0,         
        moveInterval: 5,  
        path: ['cam1', 'cam2', 'cam4', 'door'] 
    },
    freddy: {
        location: 'cam1',
        timer: 0,
        moveInterval: 8, // 讓 Freddy 稍微難捉摸一點
        path: ['cam1', 'cam2', 'cam4', 'door']
    },
};

const FREDDY_MATERIALS = {
    "Endo1": "models/Endo1_baseColor.png",
    "Endo2": "models/Hat_Bowtie_baseColor.png",
    "Eyebrows_Freckles": "models/Hat_Bowtie_baseColor.png",
    "Hat_Bowtie": "models/Hat_Bowtie_baseColor.png",
    "Mic_Black": "models/Hat_Bowtie_baseColor.png",
    "Nose": "models/Hat_Bowtie_baseColor.png",
    "Suit_1": "models/Suit_1_baseColor.png",
    "Suit_1_HEAD": "models/Suit_1_baseColor.png",
    "Suit_1_JAW": "models/Suit_1_baseColor.png",
    "Suit_2": "models/Suit_2_baseColor.png",
    "Suit_2_HEAD": "models/Suit_2_baseColor.png",
    "Teeths": "models/Teeths_baseColor.png",
    "Wire": "models/Wire_baseColor.png",
    "material": "models/material_baseColor.png",
    "material_13": "models/material_13_baseColor.png"
};

// game.js 裡的 loadOBJModel
async function loadOBJModel(url) {
    const response = await fetch(url);
    const text = await response.text();
    
    let pTemp = [], tTemp = [], nTemp = [];
    let groups = {}; // 🌟 用來存放不同材質的分組
    let currentMaterial = "default";

    const lines = text.split('\n');
    for (let line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') pTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'vt') tTemp.push(+parts[1], +parts[2]);
        else if (parts[0] === 'vn') nTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'usemtl') { 
            // 🌟 當看到 usemtl 時，切換目前的材質分組
            currentMaterial = parts[1];
            if (!groups[currentMaterial]) groups[currentMaterial] = [];
        }
        else if (parts[0] === 'f' && parts.length >= 4) {
            if (!groups[currentMaterial]) groups[currentMaterial] = [];
            for (let i = 1; i <= 3; i++) {
                const [pi, ti, ni] = parts[i].split('/').map(num => parseInt(num) - 1);
                groups[currentMaterial].push(pTemp[pi*3], pTemp[pi*3+1], pTemp[pi*3+2]);
                groups[currentMaterial].push(nTemp[ni*3], nTemp[ni*3+1], nTemp[ni*3+2]);
                groups[currentMaterial].push(tTemp[ti*2], 1.0 - tTemp[ti*2+1]);
            }
        }
    }

    // 將分組資料轉為 WebGL 可用的格式
    let result = [];
    for (let mtlName in groups) {
        result.push({
            materialName: mtlName,
            data: new Float32Array(groups[mtlName]),
            count: groups[mtlName].length / 8
        });
    }
    return result; // 現在回傳的是一個陣列，包含多個部位
}


let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setupInput() {
    // UI 按鈕監聽
    document.getElementById('btn-door-left').onclick = () => {
        GameState.leftDoorClosed = !GameState.leftDoorClosed;
        updateUsage(); // 開關門會影響耗電
    };

    document.getElementById('btn-light-left').onclick = () => {
        GameState.leftLightOn = !GameState.leftLightOn;
        updateUsage();
    }

    // 🌟 2. 新增右側按鈕監聽
    document.getElementById('btn-door-right').onclick = () => {
        GameState.rightDoorClosed = !GameState.rightDoorClosed;
        updateUsage();
    };
    document.getElementById('btn-light-right').onclick = () => {
        GameState.rightLightOn = !GameState.rightLightOn;
        updateUsage();
    };

    // 📺 打開/關閉監視器
    document.getElementById('btn-monitor').onclick = () => {
        GameState.isMonitorOpen = !GameState.isMonitorOpen;
        
        // 控制 UI 顯示與隱藏
        document.getElementById('camera-panel').style.display = GameState.isMonitorOpen ? 'block' : 'none';
        document.getElementById('crt-effect').style.display = GameState.isMonitorOpen ? 'block' : 'none';
        document.getElementById('btn-door-left').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-light-left').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-door-right').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-light-right').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-monitor').innerText = GameState.isMonitorOpen ? '📺 放下監視器' : '📺 打開監視器';
        
        updateUsage();
    };

    // 📷 切換攝影機頻道
    let camBtns = document.querySelectorAll('.cam-btn');
    camBtns.forEach(btn => {
        btn.onclick = (ev) => {
            GameState.currentCam = ev.target.getAttribute('data-cam');
            console.log("切換到攝影機:", GameState.currentCam);
        };
    });

    // 鍵盤按下與放開事件
    window.addEventListener('keydown', (ev) => {
        let k = ev.key.toLowerCase();
        if (k === ' ') k = 'Space';  // 將空格鍵映射到 'Space'
        if (GameState.keys.hasOwnProperty(k)) GameState.keys[k] = true;
        if (k === 'o') {
            GameState.obMode = !GameState.obMode; // 切換 OB 模式
            console.log("OB Mode:", GameState.obMode ? "ON" : "OFF");
        }
    });

    window.addEventListener('keyup', (ev) => {
        let k = ev.key.toLowerCase();
        if (k === ' ') k = 'Space';  // 將空格鍵映射到 'Space'
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
        //if (!isDragging || !GameState.obMode) return;
        
        if (GameState.obMode && isDragging) {
            let dx = ev.clientX - lastMouseX;
            let dy = ev.clientY - lastMouseY;
            
            GameState.obCam.yaw -= dx * 0.2; 
            GameState.obCam.pitch -= dy * 0.2; 
            GameState.obCam.pitch = Math.max(-89, Math.min(89, GameState.obCam.pitch));
            
            lastMouseX = ev.clientX;
            lastMouseY = ev.clientY;
            return; // OB 模式下不執行後面的警衛轉頭邏輯
        }

        // --- 2. 👮 警衛模式的滑鼠看圖邏輯 (FNAF 經典平移) ---
        if (!GameState.obMode && !GameState.isMonitorOpen) {
            // 將螢幕 X 座標轉換為比例： 0(最左) ~ 1(最右)
            let screenX = ev.clientX / window.innerWidth;
            
            // 轉換為 -1 (左) 到 1 (右)
            let normalizedX = screenX * 2.0 - 1.0;
            
            // 限制在左右各 85 度 (快要 90 度但不會完全折斷脖子)
            // 注意：因為 WebGL 座標系，向左看是 + 角度，所以加一個負號
            GameState.targetGuardYaw = -normalizedX * 85; 
        }

        
    });
}

// 更新耗電等級
function updateUsage() {
    let usage = 1;
    if (GameState.leftDoorClosed) usage += 1;
    if (GameState.leftLightOn) usage += 1;
    if (GameState.rightDoorClosed) usage += 1; // 🌟 加入計算
    if (GameState.rightLightOn) usage += 1;   // 🌟 加入計算
    if (GameState.isMonitorOpen) usage += 1;
    GameState.usage = usage;
}

// 🌟 修復2：清理了跑到全域範圍的重複程式碼
let powertimer = 5;

function updateLogic() {
    GameState.time += 0.01;
    powertimer -= 1;
    GameState.guardYaw += (GameState.targetGuardYaw - GameState.guardYaw) * 0.01;

    // 🌟 門的滑動物理動畫 (Lerp)
    // 如果玩家想關門，目標高度就是 1.5 (剛好碰到地板)；如果想開門，目標就是 5.0 (藏進天花板)
    let targetLeftY = GameState.leftDoorClosed ? 1.5 : 5.0;
    GameState.leftDoorY += (targetLeftY - GameState.leftDoorY) * 0.2;

    let targetRightY = GameState.rightDoorClosed ? 1.5 : 5.0; // 右門目標
    GameState.rightDoorY += (targetRightY - GameState.rightDoorY) * 0.2;
    
    if (GameState.flickerTimer > 0) {
        GameState.flickerTimer -= 0.01; 
    }

    // 🔋 扣電邏輯
    if (GameState.power > 0 && powertimer ==0 ) {
        // 每幀扣除電量 (數字可以自己調整難度)
        powertimer = 5;
        GameState.power -= (GameState.usage * 0.02); 
        if (GameState.power < 0) GameState.power = 0;

        // 更新 UI 顯示，根據耗電量改變顏色
        let powerUI = document.getElementById('power-display');
        powerUI.innerText = `Power: ${Math.floor(GameState.power)}% (Usage: ${GameState.usage})`;
        if (GameState.power < 20) powerUI.style.color = 'red';
        else if (GameState.power < 50) powerUI.style.color = 'yellow';
        else powerUI.style.color = '#0f0';
    }

    // 停電了！
    if (GameState.power === 0 && GameState.leftDoorClosed) {
        console.log("停電！門強制打開！");
        GameState.leftDoorClosed = false;
        GameState.leftLightOn = false;
        GameState.isMonitorOpen = false;
        document.getElementById('camera-panel').style.display = 'none';
        document.getElementById('crt-effect').style.display = 'none';
    }

    // 🤖 怪物 AI 邏輯 (Bonnie)
    if (GameState.power > 0) { 
        GameState.bonnie.timer += 0.01; 

        if (GameState.bonnie.timer >= GameState.bonnie.moveInterval) {
            GameState.bonnie.timer = 0; // 重置計時

            if (Math.random() > 0.4) {
                // 🌟 3. 紀錄離開的房間 (old) 與抵達的房間 (new)
                let oldLocation = GameState.bonnie.location;
                let currentIndex = GameState.bonnie.path.indexOf(oldLocation);
                
                if (currentIndex < GameState.bonnie.path.length - 1) {
                    let newLocation = GameState.bonnie.path[currentIndex + 1];
                    GameState.bonnie.location = newLocation;
                    
                    console.log(`⚠️ Bonnie 從 ${oldLocation} 移動到了 ${newLocation}`);
                    
                    // 🌟 4. 同時讓這兩台攝影機黑屏！
                    GameState.flickerCams = [oldLocation, newLocation];
                    GameState.flickerTimer = 1.5; 
                } 
                else if (GameState.bonnie.location === 'door') {
                    if (GameState.leftDoorClosed) {
                        console.log("🛡️ Bonnie 撞到門，退回去了！");
                        GameState.bonnie.location = 'cam2';
                        GameState.flickerCams = ['door', 'cam2'];
                        GameState.flickerTimer = 1.5; 
                    } else {
                        console.log("💀 JUMPSCARE！");
                        GameState.bonnie.location = 'jumpscare';
                        GameState.power = 0; 
                    }
                }
            }
        }
    }




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
        
        // Space 鍵上升，Shift 鍵下降
        if (GameState.keys.Space) { GameState.obCam.y += speed; }
        if (GameState.keys.shift) { GameState.obCam.y -= speed; }
    }
}

function gameLoop() {
    updateLogic();
    Renderer.draw(GameState);
    requestAnimationFrame(gameLoop);
}



// game.js
window.onload = async () => {
    setupInput();
    
    if (Renderer.init('webgl-canvas')) {
        try {
            // 1. 載入模型（會回傳多個零件分組）
            const freddyParts = await loadOBJModel('models/Freddy.obj');
            
            // 2. 為每個零件建立 Buffer 並配對貼圖
            Renderer.freddyModel = freddyParts.map(part => {
                const buffer = Renderer.gl.createBuffer();
                Renderer.gl.bindBuffer(Renderer.gl.ARRAY_BUFFER, buffer);
                Renderer.gl.bufferData(Renderer.gl.ARRAY_BUFFER, part.data, Renderer.gl.STATIC_DRAW);
                
                // 🌟 從對照表找出這份零件該用的貼圖路徑
                let texturePath = FREDDY_MATERIALS[part.materialName] || "models/default.png";
                
                return {
                    buffer: buffer,
                    count: part.count,
                    texture: Renderer.loadTexture(texturePath)
                };
            });

            gameLoop();
        } catch (error) {
            console.error("Freddy 載入失敗：", error);
            gameLoop();
        }
    }
};