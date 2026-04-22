// WebGL.js
const Renderer = {
    gl: null, canvas: null, program: null, cubeBufferInfo: null,

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
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        return true;
    },

    resizeCanvas: function() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
        } else {
            // 原本的保安視角 (鎖定在警衛室)
            // setLookAt(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ)
            // 眼睛位置：(0, 3, 5) - 在 Z=5 處，稍微抬高 Y=3
            // 看向的點：(0, 2, 0) - 看向原點的 Y=2 高度
            // 上向量：(0, 1, 0) - Y 軸向上，保持相機正向
            viewMatrix.setLookAt(0, 3, 5,  0, 2, 0,  0, 1, 0); 
        }

        // --- 開始捏地圖 (Blockout) ---
        // 使用 drawBlock(proj, view, X, Y, Z, 縮放X, 縮放Y, 縮放Z, 顏色R, 顏色G, 顏色B)
        // ==========================================
        // 📍 你的警衛室 (Security Office) Blockout
        // ==========================================

        // 1. 警衛室地板 (灰色)
        this.drawBlock(projMatrix, viewMatrix, 0, 0, 5,  4, 0.1, 3,  0.3, 0.3, 0.3);

        // 2. 你的辦公桌 (深棕色) - 放在你面前 Z=4 的位置
        this.drawBlock(projMatrix, viewMatrix, 0, 1, 4,  1.5, 0.1, 0.5,  0.4, 0.2, 0.1);
        this.drawBlock(projMatrix, viewMatrix, -1.2, 0.5, 4,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 左桌腳
        this.drawBlock(projMatrix, viewMatrix,  1.2, 0.5, 4,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 右桌腳

        // 3. 🛡️ 正前方牆壁 (包含 Window 和 Door 1) - Z=2
        // 窗戶左邊的牆
        this.drawBlock(projMatrix, viewMatrix, -3.0, 2.5, 2,  0.75, 2.5, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶下方的牆 (窗台，這樣上面就空出來變成窗戶了)
        this.drawBlock(projMatrix, viewMatrix, -1.5, 0.8, 2,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶上方的牆 (窗台，這樣上面就空出來變成窗戶了)
        this.drawBlock(projMatrix, viewMatrix, -1.5, 4.2, 2,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        // 窗戶與 Door 1 中間的柱子
        this.drawBlock(projMatrix, viewMatrix, 0.5, 2.5, 2,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 
        // Door 1 的門樑 (門洞上方)
        this.drawBlock(projMatrix, viewMatrix, 2, 4, 2,  1, 1, 0.2,  0.2, 0.3, 0.3); 
        // Door 1 右邊的牆
        this.drawBlock(projMatrix, viewMatrix, 3.5, 2.5, 2,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 

        // 4. 🛡️ 左邊牆壁 (包含 Door 2) - X=-4
        // 門前方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 3,  0.2, 2.5, 1,  0.2, 0.3, 0.3);
        // 門後方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 7.0, 0.2, 2.5, 1.0, 0.2, 0.3, 0.3);
        // Door 2 的門樑
        this.drawBlock(projMatrix, viewMatrix, -4, 4, 5.25,  0.2, 1, 1.3, 0.2, 0.3, 0.3);

        // 5. 🛡️ 右邊牆壁 (包含 Vent 通風管) - X=4
        this.drawBlock(projMatrix, viewMatrix, 4, 2.5, 5,  0.2, 2.5, 3,  0.2, 0.3, 0.3); // 右邊主牆
        // 用一個黑色的深色方塊假裝是通風管的開口 (Z=6 稍微靠後)
        this.drawBlock(projMatrix, viewMatrix, 3.9, 0.5, 6,  0.3, 0.5, 0.5,  0.05, 0.05, 0.05); 

        // 6. 警衛室背後的牆壁 - Z=8
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 8,  4, 2.5, 0.2,  0.2, 0.3, 0.3);
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