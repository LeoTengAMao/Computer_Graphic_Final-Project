// WebGL.js
const Renderer = {
    gl: null,
    canvas: null,
    program: null,
    cubeBufferInfo: null, // 用來存放方塊的 VBO

    // 🌟 著色器：極簡版的光照 Shader (讓紅色方塊有立體感)
    VSHADER_SOURCE: `
        attribute vec4 a_Position;
        attribute vec4 a_Normal;
        uniform mat4 u_MvpMatrix;
        uniform mat4 u_normalMatrix;
        varying vec3 v_Normal;
        void main() {
            gl_Position = u_MvpMatrix * a_Position;
            v_Normal = normalize(vec3(u_normalMatrix * a_Normal)); // 傳送法線給片段著色器
        }
    `,

    FSHADER_SOURCE: `
        precision mediump float;
        varying vec3 v_Normal;
        void main() {
            // 設定方塊基礎顏色為純紅色 (R:1, G:0, B:0)
            vec3 baseColor = vec3(1.0, 0.0, 0.0); 
            
            // 簡單的光照計算 (假設光從右上方打過來)
            vec3 lightDirection = normalize(vec3(0.5, 1.0, 1.0));
            float nDotL = max(dot(v_Normal, lightDirection), 0.0);
            
            // 加上一點環境光 (0.2) 避免暗部全黑
            vec3 finalColor = baseColor * (nDotL * 0.8 + 0.2); 
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,

    // 初始化 WebGL
    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl2');

        if (!this.gl) {
            alert('無法獲取 WebGL2 context');
            return false;
        }

        // 編譯 Shader
        this.program = this.compileShader(this.VSHADER_SOURCE, this.FSHADER_SOURCE);
        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.DEPTH_TEST); // 開啟深度測試，確保前面遮住後面

        // 建立紅色方塊的資料
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

    // 繪製畫面
    draw: function(gameState) {
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0); // 深灰色背景
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // 準備矩陣
        let projMatrix = new Matrix4();
        let viewMatrix = new Matrix4();
        let modelMatrix = new Matrix4();
        let mvpMatrix = new Matrix4();
        let normalMatrix = new Matrix4();

        // 設定透視投影
        projMatrix.setPerspective(45, this.canvas.width / this.canvas.height, 0.1, 100);

        // 設定攝影機：稍微退後一點 (Z=5) 並稍微往下看，這樣才看得出是方塊
        viewMatrix.setLookAt(
            3, 3, 5,   // 眼睛位置 (X, Y, Z)
            0, 0, 0,   // 看向原點 (方塊位置)
            0, 1, 0    // 頭頂朝上
        );

        // 設定模型矩陣：讓方塊隨著時間旋轉，方便我們觀察！
        modelMatrix.setRotate(gameState.time * 50, 0, 1, 0); // 繞 Y 軸旋轉
        modelMatrix.rotate(gameState.time * 30, 1, 0, 0);    // 繞 X 軸旋轉

        // 計算最終矩陣
        mvpMatrix.set(projMatrix).multiply(viewMatrix).multiply(modelMatrix);
        normalMatrix.setInverseOf(modelMatrix).transpose();

        // 傳送矩陣給 GPU
        let u_MvpMatrix = this.gl.getUniformLocation(this.program, 'u_MvpMatrix');
        let u_normalMatrix = this.gl.getUniformLocation(this.program, 'u_normalMatrix');
        this.gl.uniformMatrix4fv(u_MvpMatrix, false, mvpMatrix.elements);
        this.gl.uniformMatrix4fv(u_normalMatrix, false, normalMatrix.elements);

        // 開始畫圖
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

    // --- 工具：編譯 Shader ---
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

    // --- 工具：建立方塊資料 ---
    initCube: function() {
        // 方塊的 8 個頂點座標
        let vertices = new Float32Array([
             1, 1, 1,  -1, 1, 1,  -1,-1, 1,   1,-1, 1, // v0-v1-v2-v3 前面
             1, 1, 1,   1,-1, 1,   1,-1,-1,   1, 1,-1, // v0-v3-v4-v5 右面
             1, 1, 1,   1, 1,-1,  -1, 1,-1,  -1, 1, 1, // v0-v5-v6-v1 上面
            -1, 1, 1,  -1, 1,-1,  -1,-1,-1,  -1,-1, 1, // v1-v6-v7-v2 左面
            -1,-1,-1,   1,-1,-1,   1,-1, 1,  -1,-1, 1, // v7-v4-v3-v2 下面
             1,-1,-1,  -1,-1,-1,  -1, 1,-1,   1, 1,-1  // v4-v7-v6-v5 後面
        ]);

        // 方塊的法線 (用來算光照陰影)
        let normals = new Float32Array([
             0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1, // 前
             1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0, // 右
             0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0, // 上
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0, // 左
             0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0, // 下
             0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1  // 後
        ]);

        // 畫三角形的索引
        let indices = new Uint8Array([
             0, 1, 2,   0, 2, 3,    // 前
             4, 5, 6,   4, 6, 7,    // 右
             8, 9,10,   8,10,11,    // 上
            12,13,14,  12,14,15,    // 左
            16,17,18,  16,18,19,    // 下
            20,21,22,  20,22,23     // 後
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