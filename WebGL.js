// WebGL.js
const Renderer = {
    gl: null, canvas: null, program: null, cubeBufferInfo: null, cylinderBufferInfo: null,

    // Shader 增加一個 u_BaseColor，讓我們可以改變方塊顏色
    VSHADER_SOURCE: `
        attribute vec4 a_Position;
        attribute vec4 a_Normal;
        uniform mat4 u_MvpMatrix;
        uniform mat4 u_normalMatrix;
        varying vec3 v_Normal;
        void main() {
            gl_Position = u_MvpMatrix * a_Position;
            v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
        }
    `,
    FSHADER_SOURCE: `
        precision mediump float;
        varying vec3 v_Normal;
        uniform vec3 u_BaseColor; // 接收外部傳來的顏色
        void main() {
            vec3 lightDirection = normalize(vec3(0.5, 1.0, 1.0));
            float nDotL = max(dot(v_Normal, lightDirection), 0.0);
            vec3 finalColor = u_BaseColor * (nDotL * 0.7 + 0.3); // 0.3 是環境光底色
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,

    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl2');
        this.program = this.compileShader(this.VSHADER_SOURCE, this.FSHADER_SOURCE);
        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.initCube();
        this.initCylinder();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        return true;
    },

    resizeCanvas: function() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    },

    initCylinder: function() {
        let segments = 32; // 切成 32 面，看起來就會很圓
        let positions = [];
        let normals = [];
        let indices = [];

        // 1. 製作側邊牆壁
        for (let i = 0; i <= segments; i++) {
            let theta = (i / segments) * 2 * Math.PI;
            let x = Math.cos(theta);
            let z = Math.sin(theta);

            // 上緣頂點 (Y=1)
            positions.push(x, 1, z);
            normals.push(x, 0, z); // 法線朝外
            // 下緣頂點 (Y=-1)
            positions.push(x, -1, z);
            normals.push(x, 0, z);
        }

        // 把側邊頂點連成三角形
        for (let i = 0; i < segments; i++) {
            let p1 = i * 2;
            let p2 = i * 2 + 1;
            let p3 = (i + 1) * 2;
            let p4 = (i + 1) * 2 + 1;
            indices.push(p1, p2, p3);
            indices.push(p3, p2, p4);
        }

        // 2. 製作上方圓形蓋子 (舞台表面)
        let topCenterIdx = positions.length / 3;
        positions.push(0, 1, 0); // 蓋子中心點
        normals.push(0, 1, 0);   // 法線朝上
        
        let topStartIdx = positions.length / 3;
        for (let i = 0; i <= segments; i++) {
            let theta = (i / segments) * 2 * Math.PI;
            positions.push(Math.cos(theta), 1, Math.sin(theta));
            normals.push(0, 1, 0);
        }
        for (let i = 0; i < segments; i++) {
            indices.push(topCenterIdx, topStartIdx + i + 1, topStartIdx + i);
        }

        // 將陣列轉換為 WebGL 緩衝區
        let vBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        let nBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);

        let iBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, iBuffer);
        // 🌟 注意：頂點數超過 256，必須用 Uint16Array (UNSIGNED_SHORT)
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.cylinderBufferInfo = { 
            vertexBuffer: vBuffer, 
            normalBuffer: nBuffer, 
            indexBuffer: iBuffer,
            indexCount: indices.length // 紀錄要畫幾個點
        };
    },

    // 🌟 技能 2：專門畫圓柱體的函數 (跟 drawBlock 幾乎一樣，只是換了 Buffer)
    drawCylinder: function(proj, view, tx, ty, tz, sx, sy, sz, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.scale(sx, sy, sz);

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);
        this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'u_BaseColor'), r, g, b);

        // 綁定圓柱體的 Buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cylinderBufferInfo.vertexBuffer);
        let a_Position = this.gl.getAttribLocation(this.program, 'a_Position');
        this.gl.vertexAttribPointer(a_Position, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(a_Position);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cylinderBufferInfo.normalBuffer);
        let a_Normal = this.gl.getAttribLocation(this.program, 'a_Normal');
        this.gl.vertexAttribPointer(a_Normal, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(a_Normal);

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.cylinderBufferInfo.indexBuffer);
        // 🌟 呼叫 GPU 繪製 (使用 UNSIGNED_SHORT)
        this.gl.drawElements(this.gl.TRIANGLES, this.cylinderBufferInfo.indexCount, this.gl.UNSIGNED_SHORT, 0);
    },

    draw: function(gameState) {
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        let projMatrix = new Matrix4();
        let viewMatrix = new Matrix4();
        projMatrix.setPerspective(60, this.canvas.width / this.canvas.height, 0.1, 100);

        // 🌟 核心：切換 OB 模式與一般模式
        if (gameState.obMode) {
            // OB 模式：自由飛行攝影機 (利用三角函數計算看向的方向)
            let pitchRad = gameState.obCam.pitch * Math.PI / 180;
            let yawRad = gameState.obCam.yaw * Math.PI / 180;
            
            // 計算前方向量 Forward Vector (X, Y, Z)
            let fX = Math.sin(yawRad) * Math.cos(pitchRad);
            let fY = Math.sin(pitchRad);
            let fZ = -Math.cos(yawRad) * Math.cos(pitchRad);

            viewMatrix.setLookAt(
                gameState.obCam.x, gameState.obCam.y, gameState.obCam.z,
                gameState.obCam.x + fX, gameState.obCam.y + fY, gameState.obCam.z + fZ,
                0, 1, 0
            );
        } else if (gameState.isMonitorOpen && gameState.power > 0) {
            // 📺 監視器模式：根據選擇的鏡頭，把攝影機掛在天花板角落往下看
            switch (gameState.currentCam) {
                case 'cam1': // 主舞台 (從右前方往左下看舞台)
                    viewMatrix.setLookAt(8, 6, -18,  0, 2, -30,  0, 1, 0);
                    break;
                case 'cam2': // 用餐區 (從後面往前面長桌看)
                    viewMatrix.setLookAt(0, 6, -6,  0, 1, -12,  0, 1, 0);
                    break;
                case 'cam3': // 海盜灣 (由上往下特寫)
                    viewMatrix.setLookAt(-6, 6, -15,  -12, 3, -16,  0, 1, 0);
                    break;
                case 'cam4': // 右側走廊通風管
                    viewMatrix.setLookAt(8, 4, -4,  10, 2, 2,  0, 1, 0);
                    break;
                case 'cam5': // DJ台
                    viewMatrix.setLookAt(10, 8, -20,  18, 2,-16,  0, 1, 0);
                break;
                case 'cam6': // 左邊走廊
                    viewMatrix.setLookAt(-5, 3, 12 ,  -23, 2, 9,  0, 1, 0);
                break;
            }
        } else {
            // 👮 警衛模式 (坐在椅子上)
            let eyeX = 0, eyeY = 1.5, eyeZ = 12; // 警衛的座標 (你地圖 Z=12 的位置)
            
            // 將大腦算好的角度 (Degree) 轉換為弧度 (Radian)
            let radian = gameState.guardYaw * Math.PI / 180;
            
            // 利用三角函數計算出目光的落點 (目標點 X 與 Z)
            // 因為我們預設是看向 Z 軸負方向，所以 Z 是用 -cos，X 是用 -sin
            let targetX = eyeX - Math.sin(radian);
            let targetZ = eyeZ - Math.cos(radian);

            // 設定攝影機
            viewMatrix.setLookAt(
                eyeX, eyeY, eyeZ,        // 眼睛位置
                targetX, eyeY, targetZ,  // 看向的目標點
                0, 1, 0                  // 頭頂朝上
            );
        }

        // --- 開始捏地圖 (Blockout) ---
        // 使用 drawBlock(proj, view, X, Y, Z, 縮放X, 縮放Y, 縮放Z, 顏色R, 顏色G, 顏色B)
        // ==========================================
        // 📍 你的警衛室 (Security Office) Blockout
        // ==========================================

        // 1. 警衛室地板 (灰色)
        this.drawBlock(projMatrix, viewMatrix, 0, 0, 11,  4, 0.1, 3,  0.3, 0.3, 0.3);

        // 2. 你的辦公桌 (深棕色) - 放在你面前 Z=11 的位置
        this.drawBlock(projMatrix, viewMatrix, 0, 1, 10,  1.5, 0.1, 0.5,  0.4, 0.2, 0.1);
        this.drawBlock(projMatrix, viewMatrix, -1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 左桌腳
        this.drawBlock(projMatrix, viewMatrix,  1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 右桌腳

        // 3. 🛡️ 正前方牆壁 (包含 Window 和 Door 1) - Z=9
        // 窗戶左邊的牆
        this.drawBlock(projMatrix, viewMatrix, -3.0, 2.5, 8,  0.75, 2.5, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶下方的牆 (窗台，這樣上面就空出來變成窗戶了)
        this.drawBlock(projMatrix, viewMatrix, -1.5, 0.8, 8,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶上方的牆 (窗台，這樣上面就空出來變成窗戶了)
        this.drawBlock(projMatrix, viewMatrix, -1.5, 4.2, 8,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶與 Door 1 中間的柱子
        this.drawBlock(projMatrix, viewMatrix, 0.5, 2.5, 8,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 
        // Door 1 的門樑 (門洞上方)
        this.drawBlock(projMatrix, viewMatrix, 2, 4, 8,  1, 1, 0.2,  0.2, 0.3, 0.3); 
        // Door 1 右邊的牆
        this.drawBlock(projMatrix, viewMatrix, 3.5, 2.5, 8,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 

        // 4. 🛡️ 左邊牆壁 (包含 Door 2) - X=-4
        // 門前方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 9,  0.2, 2.5, 1,  0.2, 0.3, 0.3);
        // 門後方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 13.0, 0.2, 2.5, 1.0, 0.2, 0.3, 0.3);
        // Door 2 的門樑
        this.drawBlock(projMatrix, viewMatrix, -4, 4, 11.25,  0.2, 1, 1.3, 0.2, 0.3, 0.3);

        // 5. 🛡️ 右邊牆壁 (包含 Vent 通風管) - X=4
        this.drawBlock(projMatrix, viewMatrix, 4, 2.5, 11,  0.2, 2.5, 3,  0.2, 0.3, 0.3); // 右邊主牆
        // 用一個黑色的深色方塊假裝是通風管的開口 (Z=13 稍微靠後)
        this.drawBlock(projMatrix, viewMatrix, 3.8, 1.0, 12,  0.3, 1, 1,  0.05, 0.05, 0.05); 

        // 6. 警衛室背後的牆壁 - Z=15
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 14,  4, 2.5, 0.2,  0.2, 0.3, 0.3);

        // ==========================================
        // 主地圖 (根據草圖建立)
        // ==========================================

        // --- 1. 全區大地板 ---
        // 從警衛室前方一直延伸到舞台的深灰色大地板
        this.drawBlock(projMatrix, viewMatrix, 0, -0.05, -10,  25, 0.1, 25 ,  0.2, 0.2, 0.25);
        this.drawBlock(projMatrix, viewMatrix, 30, -0.05, -10,  15, 0.1, 25 ,  0.2, 0.2, 0.25); // 右邊延伸出去的地板
        this.drawBlock(projMatrix, viewMatrix, 0, -0.05, 30,  25, 0.1, 25 ,  0.2, 0.2, 0.25);

        // --- 2. 外部圍牆 (地圖的最外緣，暗紅色) ---
        // 北邊牆壁 (舞台後方)
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, -35,  25, 2.5, 0.5,   0.5, 0.15, 0.15);
        // 西邊牆壁 (海盜灣與左走廊的外牆)
        this.drawBlock(projMatrix, viewMatrix, -25, 2.5, -10,  0.5, 2.5, 25,  0.5, 0.15, 0.15);
        // 東邊牆壁 (右側房間的外牆)
        this.drawBlock(projMatrix, viewMatrix, 25, 2.5, -10,  0.5, 2.5, 25,  0.5, 0.15, 0.15);
        // 南邊牆壁 (警衛室前方的牆壁，連接左右兩側牆壁)
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 15,  25, 2.5, 0.5,   0.5, 0.15, 0.15);

        // --- 3. 🍕 主要用餐區 (Dining Area) ---
        // 你的 4 張長桌 (棕色)
        this.drawBlock(projMatrix, viewMatrix, -7.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌

        this.drawBlock(projMatrix, viewMatrix, -3.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌

        this.drawBlock(projMatrix, viewMatrix, 3.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌
        
        this.drawBlock(projMatrix, viewMatrix, 7.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌

        this.drawBlock(projMatrix, viewMatrix, -7.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌

        this.drawBlock(projMatrix, viewMatrix, -3.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌

        this.drawBlock(projMatrix, viewMatrix, 3.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌
        
        this.drawBlock(projMatrix, viewMatrix, 7.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); // 最左桌
        
        //DJ Table 

        this.drawBlock(projMatrix, viewMatrix, 18, 2, -16,  2.0 , 0.1, 5,   1, 0.5, 1); // DJ桌
        this.drawBlock(projMatrix, viewMatrix, 18, 1, -16,  1 , 1, 1,    1, 0.5, 1);


        // --- 4. 🎤 主舞台 (Stage) ---
        // 舞台底座 (稍高一點的木板)
        this.drawBlock(projMatrix, viewMatrix, 0, 0.5, -32,  10, 0.5, 2.5,   0.3, 0.2, 0.1);
        // 舞台背板/布幕 (深色)
        this.drawBlock(projMatrix, viewMatrix, 0, 3, -34.5,  8.5, 4, 0.2,   0.1, 0.1, 0.1);

        // --- 5. 🦊 海盜灣 (Pirate Cove - 左上角) ---
        // 舞台底座 (現在是真的圓形了！半徑由 sx 和 sz 決定)
        this.drawCylinder(projMatrix, viewMatrix, -18, 0.5, -18,  3.0, 0.5, 3.0,  0.2, 0.1, 0.3);
        
        // 舞台布幕 (使用原本的 drawBlock 來做一個背板)
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -21,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -21.5, 2, -18,  0.2, 2.5, 3.5,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -15,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);

        // --- 6. 🔦 連接走廊 (Corridors) ---

        // 區隔用餐區與警衛室走廊的南邊牆壁 (Z = -2)
        this.drawBlock(projMatrix, viewMatrix, -11, 2.5, 2,  8, 2.5, 0.2,  0.5, 0.15, 0.15); // 左半邊牆
        this.drawBlock(projMatrix, viewMatrix,  14, 2.5, 2,  11, 2.5, 0.2,  0.5, 0.15, 0.15); // 右半邊牆
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, -4.5,  10, 2.5, 0.2,  0.5, 0.15, 0.15); // 中間牆
        
        // 正前方走廊 (連接 Door 1 到用餐區)
        this.drawBlock(projMatrix, viewMatrix, -3.2, 2.5, 5,  0.2, 2.5, 3,   0.5, 0.15, 0.15); // 左側牆壁
        this.drawBlock(projMatrix, viewMatrix,  3.2, 2.5, 5,  0.2, 2.5, 3,   0.5, 0.15, 0.15); // 右側牆壁

        // 左側走廊 (連接 Door 2 到左邊盡頭)
        this.drawBlock(projMatrix, viewMatrix, -11, 2.5, 9, 7, 2.5, 0.2,  0.5, 0.15, 0.15); // 南側牆 (防穿幫)

        // 左側走廊 房間
        this.drawBlock(projMatrix, viewMatrix, -5.5, 2.5, 5.5,  0.2, 2.5, 3.5,   0.5, 0.15, 0.15); // 房底牆壁
        this.drawBlock(projMatrix, viewMatrix, -17.8, 2.5, 7.5,  0.2, 2.5, 1.5,   0.5, 0.15, 0.15); // 左側牆壁
        this.drawBlock(projMatrix, viewMatrix, -17.8, 2.5, 2.8,  0.2, 2.5, 0.75,   0.5, 0.15, 0.15); // 左側牆壁

        // 左側走廊 房間
        this.drawBlock(projMatrix, viewMatrix,  14, 2.5, 2,  11, 2.5, 0.2,  0.5, 0.15, 0.15); // 右半邊牆
        //通風管
        this.drawBlock(projMatrix, viewMatrix,  15, 1.5, 10,  11, 1.5, 0.2, 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  15, 3, 11.5,  11, 0.2 , 1.5 , 0.3, 0.3, 0.3); //橫的
        this.drawBlock(projMatrix, viewMatrix,  15, 1.5, 13,  11, 1.5, 0.2, 0.3, 0.3, 0.3);

        this.drawBlock(projMatrix, viewMatrix,  25, 1.5, -14,  2, 1.5, 0.2, 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  25, 3, -12.5,  2, 0.2 , 1.5 , 0.3, 0.3, 0.3); //橫的
        this.drawBlock(projMatrix, viewMatrix,  25, 1.5, -11,  2, 1.5, 0.2, 0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 24, 1.5, -12.5,  0.1, 1.3 , 1.3 , 0, 0, 0); 

        this.drawBlock(projMatrix, viewMatrix, 26, 1.5, -10,  0.2, 1.25, 25,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 27.5, 3, -10,  1.5, 0.2 , 25 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 29, 1.5, -10,  0.2, 1.25, 25,  0.3, 0.3, 0.3);

        this.drawBlock(projMatrix, viewMatrix, 11, 1.5, 5.5,  0.2, 1.25, 4.5,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 12.5, 3, 5.5,  1.5, 0.2 , 4.5 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 14, 1.5, 5.5,  0.2, 1.25, 4.5,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 12.5, 1.5, 1,  1.3, 1.3 , 0.1 , 0, 0, 0); 
    },

    // 🌟 蓋房子的積木函式：把原本 1x1 的方塊位移、縮放、上色
    drawBlock: function(proj, view, tx, ty, tz, sx, sy, sz, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.scale(sx, sy, sz);

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);
        this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'u_BaseColor'), r, g, b);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cubeBufferInfo.vertexBuffer);
        let a_Position = this.gl.getAttribLocation(this.program, 'a_Position');
        this.gl.vertexAttribPointer(a_Position, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(a_Position);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cubeBufferInfo.normalBuffer);
        let a_Normal = this.gl.getAttribLocation(this.program, 'a_Normal');
        this.gl.vertexAttribPointer(a_Normal, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(a_Normal);

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.cubeBufferInfo.indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, 36, this.gl.UNSIGNED_BYTE, 0);
    },

    // 工具：編譯 Shader
    compileShader: function(vShaderText, fShaderText) {
        let vShader = this.gl.createShader(this.gl.VERTEX_SHADER);
        this.gl.shaderSource(vShader, vShaderText);
        this.gl.compileShader(vShader);
        let fShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(fShader, fShaderText);
        this.gl.compileShader(fShader);
        let prog = this.gl.createProgram();
        this.gl.attachShader(prog, vShader);
        this.gl.attachShader(prog, fShader);
        this.gl.linkProgram(prog);
        return prog;
    },

    // 工具：建立方塊資料 (跟原本一樣)
    initCube: function() {
        let vertices = new Float32Array([
             1, 1, 1,  -1, 1, 1,  -1,-1, 1,   1,-1, 1, // 前
             1, 1, 1,   1,-1, 1,   1,-1,-1,   1, 1,-1, // 右
             1, 1, 1,   1, 1,-1,  -1, 1,-1,  -1, 1, 1, // 上
            -1, 1, 1,  -1, 1,-1,  -1,-1,-1,  -1,-1, 1, // 左
            -1,-1,-1,   1,-1,-1,   1,-1, 1,  -1,-1, 1, // 下
             1,-1,-1,  -1,-1,-1,  -1, 1,-1,   1, 1,-1  // 後
        ]);
        let normals = new Float32Array([
             0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1, 
             1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0, 
             0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0, 
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0, 
             0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0, 
             0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1  
        ]);
        let indices = new Uint8Array([
             0, 1, 2,   0, 2, 3,    4, 5, 6,   4, 6, 7,    
             8, 9,10,   8,10,11,   12,13,14,  12,14,15,    
            16,17,18,  16,18,19,   20,21,22,  20,22,23     
        ]);
        let vBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        let nBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);

        let iBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, iBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

        this.cubeBufferInfo = { vertexBuffer: vBuffer, normalBuffer: nBuffer, indexBuffer: iBuffer };
    }
};