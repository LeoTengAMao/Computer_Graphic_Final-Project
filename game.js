// game.js
const GameState = {
    time: 0,
    obMode: false, // 預設開啟 OB 模式，按 'O' 鍵可以切換
    fanAngle:0,
    // OB 攝影機狀態
    obCam: { x: 0, y: 15, z: 20, pitch: -30, yaw: 0 }, 
    // 紀錄鍵盤按下的狀態
    keys: { w: false, a: false, s: false, d: false, Space: false, shift: false }, // 🌟 修復1：這裡補上逗號了！

    timeElapsed: 0,    // 總經過秒數
    currentHour: 12,   // 顯示的小時 (從 12 開始)
    hourDuration: 90,  // 設定「一小時」等於現實生活的幾秒 (FNAF1 大約是 86-90秒)
    
    guardYaw: 0,        // 目前實際角度
    targetGuardYaw: 0,  // 滑鼠希望轉到的目標角度 (-90 到 90)   

    // ⚡ 停電死亡演出系統 (Power Out Sequence)
    isPowerOut: false,    // 總開關：是否已經完全沒電了
    powerOutPhase: 0,     // 停電演出階段 (0=正常, 1=閃爍+唱歌, 2=全黑, 3=Jumpscare)
    powerOutTimer: 0,     // 停電劇本的專屬計時器，用來控制 Freddy 什麼時候撲過來

    // 🌟 遊戲核心狀態
    powerlosttime: 20,
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

    gameStarted:false, // 遊戲是否開始了，還在讀取畫面中不能操作
    gameEnd: false, // 遊戲是否已經結束了，結束後停止一切操作
    bonnie: {
        location: 'cam1', // 一開始在主舞台
        timer: 0,         
        moveInterval: 10,  
        path: ['cam1', 'cam2', 'cam7','cam6', 'door'] 
    },
    freddy: {
        location: 'cam1',
        timer: 0,
        moveInterval: 16, // 讓 Freddy 稍微難捉摸一點
        path: ['cam1', 'cam2', 'cam5','cam8','cam4', 'door']
    },

    chica: {
      location: 'cam1',
      timer: 0,
      moveInterval: 12, 
      path: ['cam1', 'cam2', 'cam4', 'door']
  },

    foxy: {
      location: 'cam3',
      timer: 0,
      moveInterval: 200,
      phase : 0,
      runProgress :0,
      path: ['cam3','cam6','door']
  },
};

const AudioManager = {
  sounds: {}, // 存放所有載入的音效

  // 1. 載入音效
  load: function(name, url, volume = 1.0) {
      let audio = new Audio(url);
      audio.volume = volume; // 設定音量 (0.0 ~ 1.0)
      this.sounds[name] = audio;
  },

  // 2. 播放一次 (例如：腳步聲、按鈕聲)
  play: function(name) {
    if (this.sounds[name]) {
        // 🌟 關鍵：複製一份「影分身」來播放，才不會干擾原本正在播的
        let soundClone = this.sounds[name].cloneNode();
        soundClone.volume = this.sounds[name].volume; // 繼承原本設定的音量
        soundClone.play().catch(e => console.warn("等待玩家點擊後才能播放音效", e));
    }
},

  // 3. 循環播放 (例如：背景音樂、風扇聲)
  loop: function(name) {
      if (this.sounds[name]) {
          this.sounds[name].loop = true;
          this.sounds[name].play().catch(e => console.warn("等待玩家點擊後才能播放音效", e));
      }
  },

  // 4. 停止播放
  stop: function(name) {
      if (this.sounds[name]) {
          this.sounds[name].pause();
          this.sounds[name].currentTime = 0;
      }
  }

  
};

const FREDDY_MATERIALS = {
    "Endo1": "models/Freddy/Endo1_baseColor.png",
    "Endo2": "models/Freddy/Hat_Bowtie_baseColor.png",
    "Eyebrows_Freckles": "models/Freddy/Hat_Bowtie_baseColor.png",
    "Hat_Bowtie": "models/Freddy/Hat_Bowtie_baseColor.png",
    "Mic_Black": "models/Freddy/Hat_Bowtie_baseColor.png",
    "Nose": "models/Freddy/Hat_Bowtie_baseColor.png",
    "Suit_1": "models/Freddy/Suit_1_baseColor.png",
    "Suit_1_HEAD": "models/Freddy/Suit_1_baseColor.png",
    "Suit_1_JAW": "models/Freddy/Suit_1_baseColor.png",
    "Suit_2": "models/Freddy/Suit_2_baseColor.png",
    "Suit_2_HEAD": "models/Freddy/Suit_2_baseColor.png",
    "Teeths": "models/Freddy/Teeths_baseColor.png",
    "Wire": "models/Freddy/Wire_baseColor.png",
    "material": "models/Freddy/material_baseColor.png",
    "material_13": "models/Freddy/material_13_baseColor.png"
};

const BONNIE_MATERIALS = {
  "Bowtie": "models/Bonnie/Bowtie_baseColor.png",
  "Endo1.001": "models/Bonnie/Endo1.001_baseColor.png",
  "Endo2.001": "models/Bonnie/Endo2.001_baseColor.png",
  "EndoTeeth": "models/Bonnie/EndoTeeth_baseColor.png",
  "Jaw_inner": "models/Bonnie/Jaw_inner_baseColor.png",
  "Material.001": "models/Bonnie/Material.001_baseColor.png",
  "Material.002": "models/Bonnie/Material.001_baseColor.png",
  "Material.003": "models/Bonnie/Material.001_baseColor.png",
  "Material.004": "models/Bonnie/Material.001_baseColor.png",
  "Material.005": "models/Bonnie/Material.001_baseColor.png",
  "Material.006": "models/Bonnie/Material.001_baseColor.png",
  "Nose": "models/Bonnie/Nose_baseColor.png",
  "Shadeless": "models/Bonnie/Shadeless_baseColor.png",
  "Suit_Dark": "models/Bonnie/Suit_Dark_baseColor.png",
  "Suit_Light": "models/Bonnie/Suit_Light_baseColor.png",
  "Teeth": "models/Bonnie/Teeth_baseColor.png",
  "Wire.001": "models/Bonnie/Wire.001_baseColor.png",
  "material": "models/Bonnie/material_baseColor.png"
};



const FOXY_MATERIALS = {
  // Foxy 的皮膚與外殼
  "foxy_skin": "models/Foxy/foxy_skin_baseColor.png",
  "foxy_skin.002": "models/Foxy/foxy_skin.002_baseColor.png",
  "foxy_skin.003": "models/Foxy/foxy_skin.003_baseColor.png",
  "foxy_snout.001": "models/Foxy/foxy_snout.001_baseColor.png", // 嘴管/吻部
  "Jaw.001": "models/Foxy/Jaw.001_baseColor.png",             // 下巴
  "Nose": "models/Foxy/Nose_baseColor.png",                   // 鼻子
  "pants": "models/Foxy/pants_baseColor.png",                 // 招牌海盜褲

  // 內骨骼 (Endoskeleton) 與線材
  "Endo-1.002": "models/Foxy/Endo-1.002_baseColor.png",
  "Endo-2.001": "models/Foxy/Endo-2.001_baseColor.png",
  "Endo_Wire.001": "models/Foxy/Endo_Wire.001_baseColor.png",
  
  // 眼睛與牙齒
  "Eye.005": "models/Foxy/Eye.005_baseColor.png",
  "Endo-Teeths.001": "models/Foxy/Endo-Teeths.001_baseColor.png",
  "teeths.001": "models/Foxy/teeths.001_baseColor.png",
  "Hook.001": "models/Foxy/Endo-1.002_baseColor.png",       // 借用灰色的骨架鐵色
  "Golden_Teeths.001": "models/Foxy/teeths.001_baseColor.png" // 借用普通的牙齒顏色
};

const CHICA_MATERIALS = {
  "Body_CH": "models/Chica/Body_CH_baseColor.jpeg",
  "Eyes_CH": "models/Chica/Eyes_CH_baseColor.jpeg",
  "Endo_CH": "models/Foxy/Endo-1.002_baseColor.png" 
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
        if(GameState.powerOutPhase > 0) return; // 停電後不能操作門了
        GameState.leftDoorClosed = !GameState.leftDoorClosed;
        AudioManager.play('Door'); // 播放開關門音效
        updateUsage(); // 開關門會影響耗電
    };

    document.getElementById('btn-light-left').onclick = () => {
        if(GameState.powerOutPhase > 0) return;
        GameState.leftLightOn = !GameState.leftLightOn;
        if (GameState.leftLightOn) {
          // 如果燈是開的 👉 循環播放電流聲
          AudioManager.loop('light2');
      } else {
          // 如果燈是關的 👉 停止播放電流聲
          AudioManager.stop('light2');
      }
        updateUsage();
    }

    // 🌟 2. 新增右側按鈕監聽
    document.getElementById('btn-door-right').onclick = () => {
        if(GameState.powerOutPhase > 0) return;
        GameState.rightDoorClosed = !GameState.rightDoorClosed;
        AudioManager.play('Door'); // 播放開關門音效
        updateUsage();
    };
    document.getElementById('btn-light-right').onclick = () => {
        if(GameState.powerOutPhase > 0) return;
        GameState.rightLightOn = !GameState.rightLightOn;
        if (GameState.rightLightOn) {
          // 如果燈是開的 👉 循環播放電流聲
          AudioManager.loop('light');
      } else {
          // 如果燈是關的 👉 停止播放電流聲
          AudioManager.stop('light');
      }
        updateUsage();
    };

    // 📺 打開/關閉監視器
    document.getElementById('btn-monitor').onclick = () => {
        if(GameState.powerOutPhase > 0) return;
        GameState.isMonitorOpen = !GameState.isMonitorOpen;
        
        // 控制 UI 顯示與隱藏
        document.getElementById('camera-panel').style.display = GameState.isMonitorOpen ? 'block' : 'none';
        document.getElementById('crt-effect').style.display = GameState.isMonitorOpen ? 'block' : 'none';
        document.getElementById('btn-door-left').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-light-left').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-door-right').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-light-right').style.display = GameState.isMonitorOpen ? 'none' : 'block';
        document.getElementById('btn-monitor').innerText = GameState.isMonitorOpen ? '📺 放下監視器' : '📺 打開監視器';
        if(GameState.isMonitorOpen == true){
          AudioManager.play('camup');
        }
        
        updateUsage();
    };

    // 📷 切換攝影機頻道
    let camBtns = document.querySelectorAll('.cam-btn');
    camBtns.forEach(btn => {
        btn.onclick = (ev) => {
            GameState.currentCam = ev.target.getAttribute('data-cam');
            AudioManager.play('cam');
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
let powertimer = GameState.powerlosttime;

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
        powertimer = GameState.powerlosttime;
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


    // 🤖 怪物 AI 邏輯 (Bonnie)
    if (GameState.power > 0 && GameState.gameEnd === false) { 
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
                    
                    if(GameState.bonnie.location == 'cam6')AudioManager.play('Foot'); // 播放腳步聲
                    console.log(`⚠️ Bonnie 從 ${oldLocation} 移動到了 ${newLocation}`);
                    
                    // 🌟 4. 同時讓這兩台攝影機黑屏！
                    GameState.flickerCams = [oldLocation, newLocation];
                    GameState.flickerTimer = 1.5; 
                } 
                else if (GameState.bonnie.location === 'door') {
                    if (GameState.leftDoorClosed) {
                        AudioManager.play('Foot');
                        console.log("🛡️ Bonnie 撞到門，退回去了！");
                        GameState.bonnie.location = 'cam2';
                        GameState.flickerCams = ['door', 'cam2'];
                        GameState.flickerTimer = 1.5; 
                    } else {
                        AudioManager.play('Jumpscare');
                        console.log("💀 JUMPSCARE！");
                        GameState.bonnie.location = 'jumpscare';
                        GameState.gameEnd = ture; // 🌟 加上這行，確保系統進入停電癱瘓狀態，其他怪物就會停止行動
                       GameState.isMonitorOpen = false; // 強制把監視器收起來，強迫玩家直視怪物！
                        setTimeout(() => {
                        loseGame('Bonnie');
                    }, 2500); 
                    }
                }
            }
        }
    }


     // 🤖 怪物 AI 邏輯 (Chica)
    if (GameState.power > 0 && GameState.gameEnd === false) { 
      GameState.chica.timer += 0.01; 

      if (GameState.chica.timer >= GameState.chica.moveInterval) {
          GameState.chica.timer = 0; // 重置計時

          if (Math.random() > 0.4) {
              // 🌟 3. 紀錄離開的房間 (old) 與抵達的房間 (new)
              let oldLocation = GameState.chica.location;
              let currentIndex = GameState.chica.path.indexOf(oldLocation);
              
              if (currentIndex < GameState.chica.path.length - 1) {
                  let newLocation = GameState.chica.path[currentIndex + 1];
                  GameState.chica.location = newLocation;
                  
                  if(GameState.chica.location == 'cam4')AudioManager.play('Foot'); // 播放腳步聲
                  console.log(`⚠️ chica 從 ${oldLocation} 移動到了 ${newLocation}`);
                  
                  // 🌟 4. 同時讓這兩台攝影機黑屏！
                  GameState.flickerCams = [oldLocation, newLocation];
                  GameState.flickerTimer = 1.5; 
              } 
              else if (GameState.chica.location === 'door') {
                  if (GameState.rightDoorClosed) {
                      AudioManager.play('Foot');
                      console.log("🛡️ chica 撞到門，退回去了！");
                      GameState.chica.location = 'cam1';
                      GameState.flickerCams = ['door', 'cam1'];
                      GameState.flickerTimer = 1.5; 
                  } else {
                      AudioManager.play('Jumpscare');
                      console.log("💀 JUMPSCARE！");
                      GameState.chica.location = 'jumpscare';
                      GameState.gameEnd = ture; // 🌟 加上這行，確保系統進入停電癱瘓狀態，其他怪物就會停止行動
                      GameState.isMonitorOpen = false; // 強制把監視器收起來，強迫玩家直視怪物！
                      setTimeout(() => {
                        loseGame('Chica');
                    }, 2500);
                  }
              }
          }
      }
  }




    if (GameState.power > 0 && GameState.gameEnd === false) { 
      GameState.freddy.timer += 0.01; 

      if (GameState.freddy.timer >= GameState.freddy.moveInterval) {
          GameState.freddy.timer = 0; // 重置計時

          if (Math.random() > 0.4) {
              // 🌟 3. 紀錄離開的房間 (old) 與抵達的房間 (new)
              let oldLocation = GameState.freddy.location;
              let currentIndex = GameState.freddy.path.indexOf(oldLocation);
              
              if (currentIndex < GameState.freddy.path.length - 1) {
                  let newLocation = GameState.freddy.path[currentIndex + 1];
                  GameState.freddy.location = newLocation;
                  
                  AudioManager.play('FreddyLaugh'); // 播放 Freddy 的笑聲
                  console.log(`⚠️ freddy 從 ${oldLocation} 移動到了 ${newLocation}`);
                  
                  // 🌟 4. 同時讓這兩台攝影機黑屏！
                  GameState.flickerCams = [oldLocation, newLocation];
                  GameState.flickerTimer = 1.5; 
              } 
              else if (GameState.freddy.location === 'door') {
                  if (GameState.rightDoorClosed) {
                      console.log("🛡️ freddy 撞到門，退回去了！");
                      GameState.freddy.location = 'cam1';
                      GameState.flickerCams = ['door', 'cam1'];
                      GameState.flickerTimer = 1.5; 
                  } else {
                      AudioManager.play('Jumpscare');
                      console.log("💀 JUMPSCARE！");
                      GameState.freddy.location = 'jumpscare';
                      GameState.gameEnd = ture; // 🌟 加上這行，確保系統進入停電癱瘓狀態，其他怪物就會停止行動
                      GameState.isMonitorOpen = false; // 強制把監視器收起來，強迫玩家直視怪物！
                      setTimeout(() => {
                        loseGame('freddy');
                    }, 2500);
                    


                  }
              }
          }
      }
      
      let isWatchingFoxy = GameState.isMonitorOpen && GameState.currentCam === 'cam3';

      // 🌟 2. 如果「沒在看他」，或是「他已經在走廊狂奔了(phase === 3)」，才讓他計時！
      // (注意：一旦他衝出海盜灣，你看監視器也攔不住他了！)
      if (!isWatchingFoxy || GameState.foxy.phase === 3) {
          GameState.foxy.timer += 0.1; // (請配合你原本增加時間的數值，可能是 += 1 或 += deltaTime)
      }
      if (GameState.power > 0 && GameState.gameEnd === false) { 
        if (GameState.foxy.timer >= GameState.foxy.moveInterval) {
            GameState.foxy.timer = 0; // 重置計時
            if (GameState.foxy.phase < 4) {
                GameState.foxy.phase++;
                AudioManager.play('Dum'); // 探頭時的音效
            }
            if (GameState.foxy.phase ===4 ) {
                GameState.foxy.moveInterval = 5;
                // 🌟 3. 紀錄離開的房間 (old) 與抵達的房間 (new)
                let oldLocation = GameState.foxy.location;
                let currentIndex = GameState.foxy.path.indexOf(oldLocation);
                
                if (currentIndex < GameState.foxy.path.length - 1) {
                    let newLocation = GameState.foxy.path[currentIndex + 1];
                    GameState.foxy.location = newLocation;
                    
                    // 播放 Freddy 的笑聲
                    if(GameState.foxy.location !== 'door') {
                        AudioManager.play('run');
                    }
                    console.log(`⚠️ foxy 從 ${oldLocation} 移動到了 ${newLocation}`);
                    
                } 
                else if (GameState.foxy.location === 'door') {
                    if (GameState.leftDoorClosed) {
                        GameState.foxy.phase = 1;
                        GameState.foxy.moveInterval = 200; // 門會讓 Foxy 暫時退縮，減慢下一次移動的速度
                        console.log("🛡️ foxy 撞到門，退回去了！");
                        AudioManager.play('Foxy_Hit_Door');
                        GameState.power = Math.max(0, GameState.power - 5);
                        GameState.foxy.location = 'cam3';
                        GameState.flickerCams = ['door', 'cam3'];
                        GameState.flickerTimer = 1.5; 
                    } else {
                        AudioManager.play('Jumpscare');
                        console.log("💀 JUMPSCARE！");
                        GameState.foxy.location = 'jumpscare';
                        GameState.gameEnd = ture; // 🌟 加上這行，確保系統進入停電癱瘓狀態，其他怪物就會停止行動
                        GameState.isMonitorOpen = false; // 強制把監視器收起來，強迫玩家直視怪物！
                        setTimeout(() => {
                          loseGame('Foxy');
                      }, 2500); 
                    }
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


    if (GameState.power <= 0) {
    
    // 【觸發瞬間】如果才剛沒電，做一次性的狀態重置
    if (!GameState.isPowerOut) {
        GameState.isPowerOut = true;
        GameState.powerOutPhase = 1; // 進入第一階段：閃爍與唱歌
        GameState.powerOutTimer = 0; // 重置停電計時器

        // 1. 強制收起監視器，回到警衛室視角
        GameState.isMonitorOpen = false;

        // 2. 強制打開所有的門！(請確認變數名稱跟你寫的一致)
        GameState.leftDoorClosed = false; 
        GameState.rightDoorClosed = false; 

        // 3. 強制關閉玩家的探照燈
        GameState.leftLightOn = false;
        GameState.rightLightOn = false;

        // 4. 停止所有音效，播放跳電聲與音樂盒
        AudioManager.stop('light');
        AudioManager.stop('light2');
        AudioManager.stop('Fan');
        AudioManager.stop('Dum');
        AudioManager.stop('Foot');
        AudioManager.stop('FreddyLaugh');
        AudioManager.play('PowerOFF'); // 播放「咚～嗡嗡嗡」的斷電聲 (如果有的話)
        
        // 延遲 3 秒後 Freddy 開始唱歌 (音樂盒)
        setTimeout(() => {
            if (GameState.powerOutPhase === 1) {
                AudioManager.loop('MusicBox'); // FNAF 經典鬥牛士之歌
            }
        }, 3000);

        // 5. 強制把 Freddy 傳送到門口準備嚇人
        GameState.freddy.location = 'door';
    }

    // 【時間推移】依照停電計時器，推進劇本
    GameState.powerOutTimer += (1 / 60); // 假設每秒 60 幀

    if (GameState.powerOutPhase === 1) {
        // 第一階段：Freddy 在門外唱歌。維持大約 12 秒
        if (GameState.powerOutTimer > 24) {
            GameState.powerOutPhase = 2; // 進入第二階段：全黑
            AudioManager.stop('MusicBox');
            // 可以加一個沉重的腳步聲，代表他走進來了
        }
    } 
    else if (GameState.powerOutPhase === 2) {
        // 第二階段：徹底死寂。讓玩家在黑暗中恐懼 3 秒
        AudioManager.stop('MusicBox');
        if (GameState.powerOutTimer > 30) {
            GameState.powerOutPhase = 3; // 進入第三階段：死亡
            GameState.freddy.location = 'jumpscare';
            AudioManager.play('Jumpscare');

            setTimeout(() => {
                    loseGame('Freddy');
            }, 2500);
        }
    }
}





  // ==========================================
// 🦊 Foxy 衝刺動畫進度更新 (在 gameLoop 內)
// ==========================================
if (GameState.foxy.location === 'cam6') {
    // 1. 如果進度條還不存在，初始化為 0
    if (GameState.foxy.runProgress === undefined) {
        GameState.foxy.runProgress = 0;
    }

    // 2. 每一幀增加進度 (數字越大衝越快，0.02 大約是 1秒鐘跑完)
    if (GameState.foxy.runProgress < 1.0) {
        GameState.foxy.runProgress += 0.015; 
    }
} else {
    // 3. 如果 Foxy 不在走廊了 (例如被門擋回海盜灣，或是跳出 Jumpscare)
    // 就把進度歸零，為下一次衝刺做準備
    GameState.foxy.runProgress = 0; 
}

  if (GameState.gameStarted && !GameState.isPowerOut) {
    GameState.fanAngle -= 20; // 每一幀轉動 20 度
    
    // 保持角度在正常範圍
    if (GameState.fanAngle <= -360) {
        GameState.fanAngle += 360;
    }
  }
    if (GameState.gameStarted && !GameState.isPowerOut) {
          
      // 1. 增加經過的時間 (假設遊戲每秒執行 60 次，所以每次加 1/60 秒)
      GameState.timeElapsed += (1 / 60);

      // 2. 計算目前的小時
      // 每過 hourDuration 秒，小時就加 1
      let totalHoursPassed = Math.floor(GameState.timeElapsed / GameState.hourDuration);
      
      // 轉換為 12, 1, 2, 3, 4, 5, 6 的格式
      let displayHour = 12 + totalHoursPassed;
      if (displayHour > 12) displayHour -= 12; 
      
      GameState.currentHour = displayHour;

      // 3. 更新 UI 文字
      const timeUI = document.getElementById('time-display');
      if (timeUI) {
          timeUI.innerText = GameState.currentHour + " AM";
          timeUI.style.display = 'block'; // 遊戲開始後才顯示
      }

      // 4. 勝利條件判定：到了早上 6 點
      if (totalHoursPassed >= 6) {
          winGame();
          return; // 停止迴圈
      }
  }

    updateLogic();
    Renderer.draw(GameState);
    requestAnimationFrame(gameLoop);
}

function winGame() {
  GameState.gameStarted = false;
  
  // 播放 6 AM 的經典鐘聲與小孩子歡呼聲
  AudioManager.stop('light');
  AudioManager.stop('light2');
  AudioManager.stop('Fan');
  AudioManager.stop('Dum');
  AudioManager.stop('Foot');
  AudioManager.stop('FreddyLaugh'); // 停止風扇聲、跑步聲
  AudioManager.play('6AM'); 
  
  // 顯示勝利畫面
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'black';
  overlay.style.color = '#fff';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.innerHTML = '<h1 style="font-size: 80px;">6 AM</h1><p>恭喜活過這一晚！</p>';
  document.body.appendChild(overlay);

  console.log("🎊 恭喜！你活到了 6 AM！");
}

// ==========================================
// 💀 輸掉遊戲演出 (Game Over Sequence)
// ==========================================
function loseGame(animatronicName) {
    // 1. 停止遊戲邏輯迴圈與所有音效
    GameState.gameStarted = false;
    AudioManager.stop('light');
        AudioManager.stop('light2');
        AudioManager.stop('Fan');
        AudioManager.stop('Dum');
        AudioManager.stop('Foot');
        AudioManager.stop('FreddyLaugh');

    // 2. 建立全螢幕遮罩層
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    
    // 設定遮罩層樣式
    Object.assign(overlay.style, {
        position: 'absolute',
        top: '0', left: '0',
        width: '100%', height: '100%',
        backgroundColor: 'black', // FNAF 輸了就是一片漆黑
        color: '#b00', // 陰森的暗紅色文字
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '10000', // 確保蓋在所有東西上面
        fontFamily: '"Courier New", Courier, monospace', // 使用打字機字體
        cursor: 'default',
        overflow: 'hidden'
    });

    // 3. 加入靜電雜訊背景 (使用 CSS 寫好的 .static-bg)
    const staticBg = document.createElement('div');
    staticBg.className = 'static-bg';
    overlay.appendChild(staticBg);

    // 4. 加入 "Game Over" 主標題
    const title = document.createElement('h1');
    title.innerText = "GAME OVER";
    title.style.fontSize = '80px';
    title.style.margin = '0 0 10px 0';
    title.style.textShadow = '0 0 10px #f00'; // 加上紅色霓虹發光效果
    overlay.appendChild(title);

    // 5. 加入是誰殺了你的小字 (增加一點細節)
    const subText = document.createElement('p');
    subText.innerText = `You were killed by ${animatronicName.toUpperCase()}.`;
    subText.style.fontSize = '18px';
    subText.style.color = '#666'; // 灰色小字
    subText.style.margin = '0 0 50px 0';
    overlay.appendChild(subText);

    // 6. 加入「重新開始」按鈕
    const retryBtn = document.createElement('button');
    retryBtn.innerText = "RETRY";
    
    // 按鈕樣式
    Object.assign(retryBtn.style, {
        padding: '10px 40px',
        fontSize: '24px',
        backgroundColor: 'transparent',
        border: '2px solid #b00',
        color: '#b00',
        cursor: 'pointer',
        transition: 'all 0.2s',
        outline: 'none'
    });

    // 按鈕 Hover 效果 (用 JS 模擬 CSS :hover)
    retryBtn.onmouseover = () => {
        retryBtn.style.backgroundColor = '#b00';
        retryBtn.style.color = 'black';
        retryBtn.style.boxShadow = '0 0 20px #f00';
    };
    retryBtn.onmouseout = () => {
        retryBtn.style.backgroundColor = 'transparent';
        retryBtn.style.color = '#b00';
        retryBtn.style.boxShadow = 'none';
    };

    // 🌟 按鈕點擊事件：直接重新整理網頁
    retryBtn.onclick = () => {
        //AudioManager.play('cam'); // 視情況播放一個點擊音效
        location.reload(); 
    };
    overlay.appendChild(retryBtn);

    // 7. 將遮罩層加入 HTML
    document.body.appendChild(overlay);

    console.log(`💀 Game Over. Killed by ${animatronicName}.`);
}

async function loadAndParseModel(objUrl, materialDict) {
    const response = await fetch(objUrl);
    const text = await response.text();
    const obj = parseOBJ(text);
    let components = [];
    
    for (let i = 0; i < obj.geometries.length; i++) {
        const geo = obj.geometries[i];
        let o = initVertexBufferForLaterUse(Renderer.gl, geo.data.position, geo.data.normal, geo.data.texcoord);
        
        // 🌟 關鍵：直接把這塊零件專屬的「圖片路徑」存在身上！
        o.texturePath = materialDict[geo.material] || "models/default.png";
        components.push(o);
        
        // 載入貼圖
        if (!Renderer.textures[o.texturePath]) {
            Renderer.loadTexture(o.texturePath);
        }
    }
    return components;
}



window.onload = async () => {
  setupInput();
  if (Renderer.init('webgl-canvas')) {
      console.log("正在載入所有機械玩偶模型...");
      Renderer.models = {}; 

      try {
          // 🌟 把它們包在 try 裡面
          Renderer.models.freddyNormal = await loadAndParseModel('models/Freddy.obj', FREDDY_MATERIALS);
          Renderer.models.freddyVent = await loadAndParseModel('models/Freddy_Climb.obj', FREDDY_MATERIALS);
          Renderer.models.freddyDown = await loadAndParseModel('models/Freddy_down.obj', FREDDY_MATERIALS);
          Renderer.models.freddyOut = await loadAndParseModel('models/Freddy_Out.obj', FREDDY_MATERIALS);
          Renderer.models.freddyAttack = await loadAndParseModel('models/freddy__Attack.obj', FREDDY_MATERIALS);

          // 🚨 這裡請確認你的實際路徑！
          Renderer.models.bonnieNormal = await loadAndParseModel('models/Bonnie.obj', BONNIE_MATERIALS);
          Renderer.models.bonnieCam2 = await loadAndParseModel('models/Bonnie_cam2.obj', BONNIE_MATERIALS);
          Renderer.models.bonnieCam6 = await loadAndParseModel('models/Bonnie_Standby.obj', BONNIE_MATERIALS);
          Renderer.models.bonnieCam7 = await loadAndParseModel('models/Bonnie_Peek.obj', BONNIE_MATERIALS);
          Renderer.models.bonnieAttack = await loadAndParseModel('models/Bonnie_Attack.obj', BONNIE_MATERIALS);
          //Foxy
          Renderer.models.foxyNormal = await loadAndParseModel('models/Foxy.obj', FOXY_MATERIALS);
          Renderer.models.foxyP1 = await loadAndParseModel('models/Foxy_P1.obj', FOXY_MATERIALS);
          Renderer.models.foxyP2 = await loadAndParseModel('models/Foxy_P2.obj', FOXY_MATERIALS);
          Renderer.models.foxyP3 = await loadAndParseModel('models/Foxy_P3.obj', FOXY_MATERIALS);
          Renderer.models.foxyL = await loadAndParseModel('models/FoxyLeft.obj', FOXY_MATERIALS);
          Renderer.models.foxyR = await loadAndParseModel('models/FoxyRight.obj', FOXY_MATERIALS);

          Renderer.models.chicaNormal = await loadAndParseModel('models/Chica.obj', CHICA_MATERIALS);
          Renderer.models.chicaCam2 = await loadAndParseModel('models/Chica_Cam2.obj', CHICA_MATERIALS);
          Renderer.models.chicaCam4 = await loadAndParseModel('models/Chica_Cam4.obj', CHICA_MATERIALS);
          Renderer.models.chicaAttack = await loadAndParseModel('models/Chica_Attack.obj', CHICA_MATERIALS);

          // 載入音效 (你的 AudioManager 程式碼)
          AudioManager.load('Jumpscare', 'sounds/Jumpscare.mp3', 1.0); 
          AudioManager.load('cam', 'sounds/Changing_Camera.mp3', 1.0);
          AudioManager.load('camup', 'sounds/Camara.mp3', 1.0); 
          AudioManager.load('Vent', 'sounds/vent.mp3', 1.0); 
          AudioManager.load('Fan', 'sounds/Fan.mp3', 0.1); 
          AudioManager.load('PowerOFF', 'sounds/NoPower.mp3', 0.8); 
          AudioManager.load('Dum', 'sounds/DumDumDum.mp3', 0.1);
          AudioManager.load('Door', 'sounds/Door.mp3', 0.8);
          AudioManager.load('FreddyLaugh', 'sounds/Freddy_Laugh.mp3', 0.8);
          AudioManager.load('light', 'sounds/Light.mp3', 0.6); 
          AudioManager.load('light2', 'sounds/Light.mp3', 0.6); 
          AudioManager.load('Foot', 'sounds/Footsteps.mp3', 0.4); 
          AudioManager.load('run', 'sounds/Foxy_Run.mp3', 0.8); 
          AudioManager.load('Foxy_Hit_Door', 'sounds/Foxy_Hit_Door.mp3', 0.8); 
          AudioManager.load('6AM', 'sounds/6AM.mp3', 0.8); 
          AudioManager.load('MusicBox', 'sounds/Music_Box_Theme.mp3', 0.8); 
          console.log("所有模型與音效載入完成！");

          // 成功載入才顯示按鈕
          document.getElementById('loading-text').style.display = 'none';
          let btnStart = document.getElementById('btn-start');
          btnStart.style.display = 'block';

          btnStart.addEventListener('click', () => {
              document.getElementById('start-screen').style.display = 'none';
              document.getElementById('ui-layer').style.display = 'block';
              GameState.gameStarted = true;
              AudioManager.loop('Fan'); // 啟動風扇聲
              gameLoop();
          });

      } catch (error) {
          // 💀 如果載入失敗，會跑到這裡！
          console.error("載入崩潰！詳細錯誤：", error);
          
          // 把錯誤訊息直接顯示在畫面上，方便除錯
          let loadText = document.getElementById('loading-text');
          loadText.innerHTML = "載入失敗！請按 F12 檢查檔案名稱是否打錯。<br><br>" + error.message;
          loadText.style.color = "red";
      }
  }
};

function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function initArrayBufferForLaterUse(gl, data, num, type) {
  // Create a buffer object
  var buffer = gl.createBuffer();
  if (!buffer) {
    console.log('Failed to create the buffer object');
    return null;
  }
  // Write date into the buffer object
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // Store the necessary information to assign the object to the attribute variable later
  buffer.num = num;
  buffer.type = type;

  return buffer;
}

function initVertexBufferForLaterUse(gl, vertices, normals, texCoords){
  var nVertices = vertices.length / 3;

  var o = new Object();
  o.vertexBuffer = initArrayBufferForLaterUse(gl, new Float32Array(vertices), 3, gl.FLOAT);
  if( normals != null ) o.normalBuffer = initArrayBufferForLaterUse(gl, new Float32Array(normals), 3, gl.FLOAT);
  if( texCoords != null ) o.texCoordBuffer = initArrayBufferForLaterUse(gl, new Float32Array(texCoords), 2, gl.FLOAT);
  //you can have error check here
  o.numVertices = nVertices;

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return o;
}