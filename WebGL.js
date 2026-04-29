// WebGL.js
const Renderer = {
    gl: null, canvas: null, program: null, cubeBufferInfo: null, cylinderBufferInfo: null,

    VSHADER_SOURCE: `
    attribute vec4 a_Position;
    attribute vec3 a_Normal;
    attribute vec2 a_TexCoord; 
    uniform mat4 u_MvpMatrix;
    uniform mat4 u_ModelMatrix; // 新增：模型矩陣 (用來算物體在世界裡的真實位置)
    uniform mat4 u_normalMatrix;
    varying vec3 v_Normal;
    varying vec2 v_TexCoord;
    varying vec3 v_Position;    // 新增：傳遞給片段著色器的世界座標
    void main() {
        gl_Position = u_MvpMatrix * a_Position;
        v_Position = vec3(u_ModelMatrix * a_Position); // 取得真實世界座標
        v_Normal = normalize(vec3(u_normalMatrix * vec4(a_Normal, 0.0)));
        v_TexCoord = a_TexCoord;
    }
    `,

    FSHADER_SOURCE: `
    precision mediump float;
    varying vec3 v_Normal;
    varying vec2 v_TexCoord;
    uniform sampler2D u_Sampler;
    uniform vec3 u_BaseColor; 
    varying vec3 v_Position; 
    uniform bool u_UseTexture; 

    #define NUM_LIGHTS 11 // 宣告這個世界最多有 11 盞燈！

    uniform vec3 u_LightPos[NUM_LIGHTS];   // 11 個位置
    uniform vec3 u_LightColor[NUM_LIGHTS]; // 11 個顏色

    void main() {
        vec4 color;
        if (u_UseTexture) {
            color = texture2D(u_Sampler, v_TexCoord);
        } else {
            color = vec4(u_BaseColor, 1.0);
        }
        
        vec3 totalDiffuse = vec3(0.0); // 準備一個變數，用來收集所有燈泡的光

        // 迴圈：計算 10 盞燈的衰減與亮度，全部加在一起
        for(int i = 0; i < NUM_LIGHTS; i++) {
            vec3 lightDir = u_LightPos[i] - v_Position;
            float distance = length(lightDir);
            lightDir = normalize(lightDir);

            float nDotL = max(dot(v_Normal, lightDir), 0.0);
            float attenuation = 1.0 / (1.0 + 0.15 * distance + 0.05 * (distance * distance));
            
            totalDiffuse += u_LightColor[i] * color.rgb * nDotL * attenuation;
        }

        // 環境光 (底色)
        vec3 ambient = color.rgb * 0.02; 
        
        // 最終顏色 = 底色 + 所有燈光的總和
        gl_FragColor = vec4(ambient + totalDiffuse, color.a);
    }
    `,

    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl2');
        this.program = this.compileShader(this.VSHADER_SOURCE, this.FSHADER_SOURCE);
        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
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
        // 注意：頂點數超過 256，必須用 Uint16Array (UNSIGNED_SHORT)
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.cylinderBufferInfo = { 
            vertexBuffer: vBuffer, 
            normalBuffer: nBuffer, 
            indexBuffer: iBuffer,
            indexCount: indices.length // 紀錄要畫幾個點
        };
    },

    // 技能 2：專門畫圓柱體的函數 (跟 drawBlock 幾乎一樣，只是換了 Buffer)
    drawCylinder: function(proj, view, tx, ty, tz, sx, sy, sz, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.scale(sx, sy, sz);

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        // 在 drawCylinder 裡面加上這行
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_UseTexture'), 0);

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
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
        // 呼叫 GPU 繪製 (使用 UNSIGNED_SHORT)
        this.gl.drawElements(this.gl.TRIANGLES, this.cylinderBufferInfo.indexCount, this.gl.UNSIGNED_SHORT, 0);
    },

        // WebGL.js 內部
    loadTexture: function(url) {
        let texture = this.gl.createTexture();
        let image = new Image();
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
            console.log("Texture loaded: " + url);
        };
        image.src = url;
        
        // 核心修正：一定要把它存進字典裡，drawFreddy 才找得到！
        this.textures[url] = texture; 
        
        return texture;
    },

    textures: {},

    // 專門為了電風扇發明的新技能：畫出會自轉的方塊！
    drawRotatedBlock: function(proj, view, tx, ty, tz, sx, sy, sz, angle, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);      // 3. 移動到桌上
        modelMatrix.rotate(angle, 0, 0, 1);     // 2. 繞著自己的 Z 軸旋轉
        modelMatrix.scale(sx, sy, sz);          // 1. 先縮放成葉片的形狀

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        let gl = this.gl;
        gl.useProgram(this.program);

        // 關閉貼圖，設定顏色
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_UseTexture'), 0);
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_BaseColor'), r, g, b);

        // 傳入矩陣
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);

        // 繪製方塊
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBufferInfo.vertexBuffer);
        let a_Position = gl.getAttribLocation(this.program, 'a_Position');
        gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Position);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBufferInfo.normalBuffer);
        let a_Normal = gl.getAttribLocation(this.program, 'a_Normal');
        gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Normal);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeBufferInfo.indexBuffer);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
    },

    // 改名為 drawCharacter，因為它現在什麼角色都能畫了！
    drawCharacter: function(proj, view, tx, ty, tz, sx, sy, sz, ry, components) {
        if (!components) return; 

        // 1. 計算矩陣
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.rotate(ry, 0, 1, 0);
        modelMatrix.scale(sx, sy, sz);

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        let gl = this.gl;
        gl.useProgram(this.program);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);

        let a_Position = gl.getAttribLocation(this.program, 'a_Position');
        let a_Normal = gl.getAttribLocation(this.program, 'a_Normal');
        let a_TexCoord = gl.getAttribLocation(this.program, 'a_TexCoord');
        let u_Sampler = gl.getUniformLocation(this.program, 'u_Sampler');
        let u_UseTexture = gl.getUniformLocation(this.program, 'u_UseTexture');

        // 4. 迴圈畫出所有部位
        for (let i = 0; i < components.length; i++) {
            let comp = components[i];
            
            // 終極修正：直接讀取載入時存好的 texturePath，不再依賴 FREDDY_MATERIALS！
            let imgPath = comp.texturePath; 
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[imgPath]);
            gl.uniform1i(u_Sampler, 0);
            gl.uniform1i(u_UseTexture, 1);

            this.initAttributeVariable(a_Position, comp.vertexBuffer);
            this.initAttributeVariable(a_Normal, comp.normalBuffer);
            this.initAttributeVariable(a_TexCoord, comp.texCoordBuffer);

            gl.drawArrays(gl.TRIANGLES, 0, comp.numVertices);
        }
    },





    draw: function(gameState) {
        this.gl.clearColor(0.05, 0.05, 0.05, 1.0); // 建議把背景色調暗一點
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.gl.useProgram(this.program);


        // 圖學燈光系統：保安室頂燈

        // 圖學燈光系統：全區 10 盞燈陣列
  
        
        let officeR = 0.8, officeG = 0.7, officeB = 0.5; // 正常微黃光

        if (gameState.isPowerOut) {
            if (gameState.powerOutPhase === 1) {
                // 停電第一階段：Freddy 唱歌時，給予微弱且隨機閃爍的光 (模擬月光或微弱備用電)
                let flicker = (Math.random() > 0.5) ? 0.15 : 0.02;
                officeR = flicker; officeG = flicker; officeB = flicker;
            } else if (gameState.powerOutPhase === 2){
                // 停電第二與第三階段：全黑死寂
                officeR = 0.3; officeG = 0.3; officeB = 0.3;
            }else if (gameState.powerOutPhase === 3){
                officeR = 1.0; officeG = 1.0; officeB = 1.0;
            }
        }

        // 準備 10 個燈泡的座標 [X, Y, Z,  X, Y, Z...] (總共 30 個數字)
        let lightPositions = new Float32Array([
            0.0, 4.5, 10.0,   // 燈 0：保安室
            0.0, 6, -32.0,  // 燈 1：主舞台 (Cam 1)
            -18.0, 3.5, -18.0,// 燈 2：海盜灣 (Cam 3)
            -23, 2, 9,  // 燈 3：左側走廊 (Cam 6)
            10, 4, 2,   // 燈 4：右側走廊 (Cam 4)
            0, 1, -12,  // 燈 5：用餐區 (Cam 2)
            // 下面是還沒用到的備用燈泡，先把它們丟到很遠的地方
            -5.0, 4, 11.25,    // 燈 6 左燈
            0.0, 4, 6.0,    // 燈 7 前燈
            -16, 1, 6,    // 燈 8
            18, 2,-16,     // 燈 9 DJ
            -1.5, 2, 9
        ]);

        // 準備 10 個燈泡的顏色 [R, G, B,  R, G, B...] (總共 30 個數字)
        let lightColors = new Float32Array([
            officeR, officeG, officeB,  // 燈 0：保安室 (微弱黃光)
            1.6, 1.6, 2.4,  // 燈 1：主舞台 (帶點詭異的冷藍光)
            1.0, 0.1, 0.1,  // 燈 2：海盜灣 (壓迫感極重的暗紅光)
            !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 0.7 : 0.0,  // 燈 3：左側走廊 (微弱白光)
            !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 1.5 : 0.0,
            !gameState.isPowerOut ? 1.5 : 0.0,
            !gameState.isPowerOut ? 1.5 : 0.0,
            // 下面是備用的燈，顏色設為 0, 0, 0 (完全不發光，就不會影響畫面)
            // 燈 3：左門探照燈 (沒電就強制不亮)
            (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, 
            (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, 
            (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, 
            
            // 燈 4：前門/窗探照燈 (沒電就強制不亮)
            (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0, 
            (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0, 
            (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0,
            0.8, 0.7, 0.5,  // 燈 8
            1.5, 1.5, 1.5 ,  // 燈 9 DJ
            (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0, // 燈 10 (備用燈)
            (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0,
            (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0
            
        ]);

        // 把這兩大串陣列一口氣丟給顯示卡！(注意：要用 uniform3fv 而不是 uniform3f)
        let u_LightPos = this.gl.getUniformLocation(this.program, 'u_LightPos');
        let u_LightColor = this.gl.getUniformLocation(this.program, 'u_LightColor');
        
        this.gl.uniform3fv(u_LightPos, lightPositions);
        this.gl.uniform3fv(u_LightColor, lightColors);




        // 1. 監視器打開中
        // 2. 還在干擾時間內
        // 3. 有電  
        // 4. 目前看的這台攝影機，剛好包含在「壞掉名單(flickerCams)」裡面！
        let isFlickering = gameState.isMonitorOpen && 
                           gameState.flickerTimer > 0 && 
                           gameState.power > 0 &&
                           gameState.flickerCams.includes(gameState.currentCam);

        if (isFlickering) {
            // 把背景塗成純黑色 (模擬斷訊)
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0); 
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            
            // 直接 return，不把地圖畫出來！
            return; 
        }



        let projMatrix = new Matrix4();
        let viewMatrix = new Matrix4();
        projMatrix.setPerspective(60, this.canvas.width / this.canvas.height, 0.1, 100);

        // 切換 OB 模式與一般模式
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
            // 監視器模式：根據選擇的鏡頭，把攝影機掛在天花板角落往下看
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
                case 'cam7': // 左邊小防間
                    viewMatrix.setLookAt(-8, 4.5, 8 ,  -16, 1, 6,  0, 1, 0);
                break;
                case 'cam8': // 通風管道
                    viewMatrix.setLookAt(27.5, 2, 14,  24, 3, -8.5,  0, 1, 0);
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
      
        // 警衛室 (Security Office) Blockout


        // 1. 警衛室地板 (灰色)
        this.drawBlock(projMatrix, viewMatrix, 0, 0, 11,  4, 0.1, 3,  0.3, 0.3, 0.3);

        // 2. 你的辦公桌 (深棕色) - 放在你面前 Z=11 的位置
        this.drawBlock(projMatrix, viewMatrix, 0, 1, 10,  1.5, 0.1, 0.5,  0.4, 0.2, 0.1);
        this.drawBlock(projMatrix, viewMatrix, -1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 左桌腳
        this.drawBlock(projMatrix, viewMatrix,  1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); // 右桌腳

        // 3. 正前方牆壁 (包含 Window 和 Door 1) - Z=9
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

        this.drawBlock(projMatrix, viewMatrix, 2, gameState.rightDoorY, 8, 1.25 ,2 , 0.15,  0.2, 0.25, 0.3);

        // 4. 左邊牆壁 (包含 Door 2) - X=-4
        // 門前方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 9,  0.2, 2.5, 1,  0.2, 0.3, 0.3);
        // 門後方的牆
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 13.0, 0.2, 2.5, 1.0, 0.2, 0.3, 0.3);
        // Door 2 的門樑
        this.drawBlock(projMatrix, viewMatrix, -4, 4, 11.25,  0.2, 1, 1.3, 0.2, 0.3, 0.3);

        
        // 繪製左邊的金屬防護門 (會上下滑動)
       
       
        
        this.drawBlock(projMatrix, viewMatrix, -4, gameState.leftDoorY, 11.25,  0.15, 1.5, 1.1,  0.2, 0.25, 0.3);

        // 5. 右邊牆壁 (包含 Vent 通風管) - X=4
        this.drawBlock(projMatrix, viewMatrix, 4, 2.5, 11,  0.2, 2.5, 3,  0.2, 0.3, 0.3); // 右邊主牆
        // 用一個黑色的深色方塊假裝是通風管的開口 (Z=13 稍微靠後)
        this.drawBlock(projMatrix, viewMatrix, 3.8, 1.0, 12,  0.3, 1, 1,  0.05, 0.05, 0.05); 

        // 6. 警衛室背後的牆壁 - Z=15
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 14,  4, 2.5, 0.2,  0.2, 0.3, 0.3);

        
        // 主地圖 (根據草圖建立

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

        // --- 3. 主要用餐區 (Dining Area) ---
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


        // --- 4. 主舞台 (Stage) ---
        // 舞台底座 (稍高一點的木板)
        this.drawBlock(projMatrix, viewMatrix, 0, 0.5, -32,  10, 0.5, 2.5,   0.3, 0.2, 0.1);
        // 舞台背板/布幕 (深色)
        this.drawBlock(projMatrix, viewMatrix, 0, 3, -34.5,  8.5, 4, 0.2,   0.1, 0.1, 0.1);

        // --- 5.  海盜灣 (Pirate Cove - 左上角) ---
        // 舞台底座 (現在是真的圓形了！半徑由 sx 和 sz 決定)
        this.drawCylinder(projMatrix, viewMatrix, -18, 0.5, -18,  3.0, 0.5, 3.0,  0.2, 0.1, 0.3);
        
        // 舞台布幕 
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -21,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -21.5, 2, -18,  0.2, 2.5, 3.5,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -15,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);

        // --- 6. 連接走廊 (Corridors) ---

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


        // 辦公室電風扇 (極簡旋轉版)
   
        let fX = 0.8, fY = 1.1, fZ = 10.1; 

        // 1. 底盤與支柱 (靜態)
        this.drawCylinder(projMatrix, viewMatrix, fX, fY, fZ, 0.15, 0.02, 0.15, 0.2, 0.2, 0.2);
        this.drawCylinder(projMatrix, viewMatrix, fX, fY + 0.1, fZ, 0.02, 0.1, 0.02, 0.2, 0.2, 0.2);

        // 2. 馬達頭 (靜態)
        this.drawBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ, 0.08, 0.08, 0.1, 0.2, 0.2, 0.2);

        // 3. 會旋轉的十字葉片！(使用新的 drawRotatedBlock，並傳入 gameState.fanAngle)
        
        // 垂直葉片 ( | 形狀 )
        this.drawRotatedBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ + 0.11, 0.02, 0.15, 0.01, gameState.fanAngle, 0.05, 0.05, 0.05);
        
        // 水平葉片 ( - 形狀 )
        this.drawRotatedBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ + 0.11, 0.15, 0.02, 0.01, gameState.fanAngle, 0.05, 0.05, 0.05);




  
        // 繪製怪物 (Bonnie) - 真實 3D 空間實體版
    
        let bLoc = gameState.bonnie.location;
        
        if (Renderer.models && Renderer.models.bonnieNormal) {
            let bLoc = gameState.bonnie.location;
            //let bLoc = 'jumpscare';
            let currentBonnie = Renderer.models.bonnieNormal; // 預設使用普通站姿
            
            // 設定 Bonnie 在一般場景裡的大小 (請依據你的模型實際大小微調，這裡先預設跟 Freddy 一樣 1.8)
            let bScale = 0.04; 

            if (bLoc === 'cam1') {
                // 在舞台上 
                // 參數：投影, 視角, X, Y, Z, 縮放X, 縮放Y, 縮放Z, 旋轉Y角, 模型檔案
                currentBonnie = Renderer.models.bonnieNormal;
                this.drawCharacter(projMatrix, viewMatrix, -4, 1, -32, bScale, bScale, bScale, 0, currentBonnie); 
            } 
            else if (bLoc === 'cam2') {
                // 在用餐區長桌旁 
                currentBonnie = Renderer.models.bonnieCam2;
                this.drawCharacter(projMatrix, viewMatrix, 0, 1, -11, bScale, bScale, bScale, -30, currentBonnie); 
            } 
            else if (bLoc === 'cam4') {
                
                this.drawCharacter(projMatrix, viewMatrix, 8, 1, 2, bScale, bScale, bScale, -45, currentBonnie); 
            }
            else if (bLoc === 'cam6') {
                
                currentBonnie = Renderer.models.bonnieCam6;
                this.drawCharacter(projMatrix, viewMatrix, -18, 0, 13, bScale, bScale, bScale, 90, currentBonnie); 
            } 
            else if (bLoc === 'cam7') {
                
                currentBonnie = Renderer.models.bonnieCam7;
                this.drawCharacter(projMatrix, viewMatrix, -11, 0, 7.8, bScale, bScale, bScale, 145, currentBonnie); 
            }  
            else if (bLoc === 'door') {
                if (gameState.leftLightOn) {
                    // 畫在左邊門口的窗外，旋轉 90 度讓她面向辦公室裡面
                    // 這裡的縮放設定為 0.6，配合門口的大小
                    this.drawCharacter(projMatrix, viewMatrix, -5.5, 0, 11, 0.03, 0.03, 0.03, 90, currentBonnie); 
                }
            } 
            else if (bLoc === 'jumpscare') {

                // 利用原本的三角函數做出瘋狂抖動的效果
                currentBonnie = Renderer.models.bonnieAttack;
                let shakeX = Math.sin(gameState.time * 50) * 0.1;
                let shakeY = Math.cos(gameState.time * 70) * 0.1;
        
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -1 + shakeY, 11, 0.03, 0.03, 0.03, 0, currentBonnie); 
            }
        }

        
        

        if (Renderer.models && Renderer.models.freddyNormal) {
            let loc = gameState.freddy.location;

            //let loc = 'jumpscare';
            let fScale = 1.8;
            // 決定要用哪一個模型！
            let currentModel = Renderer.models.freddyNormal; 
            
            if (loc === 'cam1') {
                // 畫在舞台上
    
                currentModel = Renderer.models.freddyNormal;
                this.drawCharacter(projMatrix, viewMatrix, 3, 1, -32, fScale, fScale, fScale, 0, currentModel); 
            }else if(loc === 'cam2'){
                currentModel = Renderer.models.freddyNormal;
                this.drawCharacter(projMatrix, viewMatrix, 10, 0, -18, fScale, fScale, fScale, 55, currentModel); 
            }else if(loc === 'cam5'){
                currentModel = Renderer.models.freddyDown;
                this.drawCharacter(projMatrix, viewMatrix, 21, 0, -10, fScale, fScale, fScale, 135, currentModel); 
            }else if(loc === 'cam8'){
                currentModel = Renderer.models.freddyVent;
                this.drawCharacter(projMatrix, viewMatrix, 27.5, 0, 6, 1.4, 1.4, 1.4, 0, currentModel); 
            }else if(loc === 'cam4'){
                currentModel = Renderer.models.freddyOut;
                this.drawCharacter(projMatrix, viewMatrix, 7, 0, 0, fScale, fScale, fScale, 180, currentModel); 
            }else if (loc === 'door') {
                currentModel = Renderer.models.freddyAttack;
                if(gameState.powerOutPhase === 1){
                    this.drawCharacter(projMatrix, viewMatrix, -0.5, 0, 5, fScale, fScale, fScale, 0, currentModel);
                }
            }else if (loc === 'jumpscare') {
                currentModel = Renderer.models.freddyAttack;
                
            
                let shakeX = Math.sin(gameState.time * 50) * 0.1;
                let shakeY = Math.cos(gameState.time * 70) * 0.1;
                
               
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 11, fScale, fScale,fScale, 0, currentModel); 
            }
        }

        if (Renderer.models && Renderer.models.chicaNormal) {
            let loc = gameState.chica.location;

            //let loc = 'cam4';
            let CScale = 0.045;
            // 決定要用哪一個模型
            let currentModel = Renderer.models.chicaNormal; 
            
            if (loc === 'cam1') {
                currentModel = Renderer.models.chicaNormal;
                this.drawCharacter(projMatrix, viewMatrix, 0, 1, -32, CScale, CScale, CScale, 0, currentModel); 
            }else if(loc === 'cam2'){
                currentModel = Renderer.models.chicaCam2;
                this.drawCharacter(projMatrix, viewMatrix, -2, 0, -9, CScale, CScale, CScale, 90, currentModel); 
                
            }else if(loc === 'cam4'){
                currentModel = Renderer.models.chicaCam4;
                this.drawCharacter(projMatrix, viewMatrix, 9, 0, -3, CScale, CScale, CScale, 200 , currentModel); 
                
            }else if (loc === 'door' && gameState.rightLightOn) {
                currentModel = Renderer.models.chicaNormal;

                if (gameState.rightLightOn) {

                    this.drawCharacter(projMatrix, viewMatrix, -0.5, 0, 5, CScale, CScale, CScale, 0, currentModel); 
                }
            }else if (loc === 'jumpscare') {
                currentModel = Renderer.models.chicaAttack;
                
            
                let shakeX = Math.sin(gameState.time * 50) * 0.1;
                let shakeY = Math.cos(gameState.time * 70) * 0.1;
                
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 10, CScale, CScale, CScale, 0, currentModel); 
            }
        }

        if (Renderer.models && Renderer.models.foxyNormal) {
            let loc = gameState.foxy.location;

            //let loc = 'jumpscare';
            let foxyScale = 0.2;
         
            let currentModel = Renderer.models.foxyNormal; 
            
            if (loc === 'cam3') {
                if(GameState.foxy.phase === 0){
                    currentModel = Renderer.models.foxyNormal;
                }else if(GameState.foxy.phase === 1){
                    currentModel = Renderer.models.foxyP1;
                }else if(GameState.foxy.phase === 2){
                    currentModel = Renderer.models.foxyP2;
                }else if(GameState.foxy.phase === 3){
                    currentModel = Renderer.models.foxyP3;
                }
                this.drawCharacter(projMatrix, viewMatrix, -18, 1, -18, foxyScale, foxyScale, foxyScale, 90, currentModel); 
            }else if (loc === 'cam6') {
                //每 150 毫秒切換一次左右腳！
                let isLeftFoot = Math.floor(Date.now() / 150) % 2 === 0; 
                
                // 根據上面的計算，決定現在要畫哪一個模型
                let currentModel = isLeftFoot ? Renderer.models.foxyL : Renderer.models.foxyR;

                //2. 衝刺位移：計算 Foxy 目前在走廊的深度 (Z 軸)
                let startx = -18;
                let endx = -2; 
                
                // 讀取大腦裡的「奔跑進度 (0.0 ~ 1.0)」，算出現在真正的 Z 座標
                // (如果沒讀到，預設給 0，避免報錯)
                let currentX = startx + (endx - startx) * (gameState.foxy.runProgress || 0);

                // 畫出狂奔的 Foxy
                if (currentModel) {
                    this.drawCharacter(projMatrix, viewMatrix, currentX, 0, 11, foxyScale, foxyScale, foxyScale, 90, currentModel);
                }
            }else if (loc === 'jumpscare') {
                currentModel = Renderer.models.foxyNormal;
                
            
                let shakeX = Math.sin(gameState.time * 50) * 0.1;
                let shakeY = Math.cos(gameState.time * 70) * 0.1;
                
             
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 11, foxyScale, foxyScale, foxyScale, 0, currentModel); 
            }
        }

    },


    initAttributeVariable: function(a_attribute, buffer) {
        //如果這個零件沒有資料 (buffer 為 undefined)，就直接跳過，不報錯
        if (!buffer) return; 
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.vertexAttribPointer(a_attribute, buffer.num, buffer.type, false, 0, 0);
        this.gl.enableVertexAttribArray(a_attribute);
    },

    // 蓋房子的積木函式：把原本 1x1 的方塊位移、縮放、上色
    drawBlock: function(proj, view, tx, ty, tz, sx, sy, sz, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.scale(sx, sy, sz);

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        let gl = this.gl;
        gl.useProgram(this.program);

        // 核心修正：強制關閉貼圖開關
        let u_UseTexture = gl.getUniformLocation(this.program, 'u_UseTexture');
        gl.uniform1i(u_UseTexture, 0); // 0 代表 False，不使用貼圖

        // 傳入原本牆壁該有的顏色
        let u_BaseColor = gl.getUniformLocation(this.program, 'u_BaseColor');
        gl.uniform3f(u_BaseColor, r, g, b);

        

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
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