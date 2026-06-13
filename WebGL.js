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

    // 高光需要的變數
    uniform vec3 u_EyePos;          
    uniform float u_Shininess;      
    uniform vec3 u_MaterialSpecular;

    // 環境貼圖反射需要的變數
    uniform samplerCube u_SkyboxSampler; 
    uniform float u_EnvReflectWeight;   

    // 探照燈陰影需要的變數 
    uniform sampler2D u_ShadowMap;      // 剛剛畫好的右門燈深度貼圖
    uniform mat4 u_LightMvpMatrix;      // 右門燈的 MVP 矩陣（用來把世界座標轉向光源視角）

    #define NUM_LIGHTS 11 

    uniform vec3 u_LightPos[NUM_LIGHTS];   
    uniform vec3 u_LightColor[NUM_LIGHTS]; 

    void main() {
        vec4 color;
        if (u_UseTexture) {
            color = texture2D(u_Sampler, v_TexCoord);
        } else {
            color = vec4(u_BaseColor, 1.0);
        }
        
        vec3 normal = normalize(v_Normal);
        vec3 viewDir = normalize(u_EyePos - v_Position);

        // 1. 將真實世界座標乘以右門燈的 MVP，得到光源空間下的座標
        vec4 posFromLight = u_LightMvpMatrix * vec4(v_Position, 1.0);
        // 2. 進行透視除法，轉為 [-1, 1] 裁剪座標
        vec3 shadowCoord = (posFromLight.xyz / posFromLight.w) * 0.5 + 0.5;
        
        // 3. 讀取 Shadow Map 中紀錄的最近深度
        float depthInShadowMap = texture2D(u_ShadowMap, shadowCoord.xy).r;
        // 當前物體實際到光源的深度
        float currentDepth = shadowCoord.z;
        
        // 4. 對比深度（加上 0.005 的 Shadow Bias 偏置，防止發生經典的 Shadow Acne 陰影粉刺破圖）
        float shadowWeight = 1.0;
        if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0) {
            if (depthInShadowMap < currentDepth - 0.005) {
                shadowWeight = 0.15; // 處於陰影區！將這盞燈的光照強度壓低到 15% (留下一點微弱環境光，看起來更寫實)
            }
        }

        vec3 totalDiffuse = vec3(0.0); 
        vec3 totalSpecular = vec3(0.0); 

        // 計算 11 盞燈
        for(int i = 0; i < NUM_LIGHTS; i++) {
            vec3 lightDir = u_LightPos[i] - v_Position;
            float distance = length(lightDir);
            lightDir = normalize(lightDir);

            float nDotL = max(dot(normal, lightDir), 0.0);
            float attenuation = 1.0 / (1.0 + 0.15 * distance + 0.05 * (distance * distance));
            
            // 漫反射累加
            vec3 diff = u_LightColor[i] * color.rgb * nDotL * attenuation;
            
            // 高光累加
            vec3 spec = vec3(0.0);
            if (nDotL > 0.0) {
                vec3 reflectDir = reflect(-lightDir, normal);
                float rDotV = max(dot(reflectDir, viewDir), 0.0);
                float specularWeight = pow(rDotV, u_Shininess);
                spec = u_LightColor[i] * u_MaterialSpecular * specularWeight * attenuation;
            }

            // 如果是右門探照燈（也就是你的燈 7，前/右燈），強行乘以陰影權重！
            if (i == 7) {
                diff *= shadowWeight;
                spec *= shadowWeight;
            }

            totalDiffuse += diff;
            totalSpecular += spec;
        }

        vec3 ambient = color.rgb * 0.02; 
        vec3 lightingColor = ambient + totalDiffuse + totalSpecular;

        // 環境反射
        vec3 incidentDir = normalize(v_Position - u_EyePos); 
        vec3 envReflectDir = reflect(incidentDir, normal);
        vec4 reflectColor = textureCube(u_SkyboxSampler, envReflectDir);

        vec3 finalColor = mix(lightingColor, reflectColor.rgb, u_EnvReflectWeight);
        
        gl_FragColor = vec4(finalColor, color.a);
    }
    `,

    // WebGL.js 頂部新增
    SKYBOX_VSHADER: `
    attribute vec4 a_Position;
    varying vec3 v_TexCoord; // 天空盒的紋理座標是 3D 向量 (指向方塊的外側)
    uniform mat4 u_MvpMatrix;
    void main() {
        gl_Position = u_MvpMatrix * a_Position;
        v_TexCoord = normalize(a_Position.xyz); // 直接用頂點的相對位置當作採樣方向！
    }
    `,

    SKYBOX_FSHADER: `
    precision mediump float;
    varying vec3 v_TexCoord;
    uniform samplerCube u_Skybox; // 注意：這裡是 samplerCube，不是 sampler2D
    void main() {
        gl_FragColor = textureCube(u_Skybox, v_TexCoord);
    }
    `,

    SHADOW_VSHADER: `
    attribute vec4 a_Position;
    uniform mat4 u_MvpMatrix;
    varying vec4 v_PositionFromLight;
    void main() {
        gl_Position = u_MvpMatrix * a_Position;
        v_PositionFromLight = gl_Position; // 把光源視角下的裁剪座標傳給片段著色器
    }
    `,

    SHADOW_FSHADER: `
    precision mediump float;
    varying vec4 v_PositionFromLight;
    void main() {
        // 將深度值 (Z/W) 從 [-1, 1] 對齊到 [0, 1] 的區間，並存入 RGBA 的 R 通道（或是直接利用高精度深度）
        // WebGL 預設會自動處理深度緩衝區，這裡我們直接塗一個顏色，核心由 WebGL 深度測試幫我們記錄
        gl_FragColor = vec4(vec3(v_PositionFromLight.z / v_PositionFromLight.w * 0.5 + 0.5), 1.0);
    }
    `,

    shadowProgram: null, // 用來存編譯好的陰影著色器程式
    skyboxProgram: null, // 用來存編譯好的 Skybox 著色器程式

    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl2');
        this.program = this.compileShader(this.VSHADER_SOURCE, this.FSHADER_SOURCE);
        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        // 初始化五兄弟
        this.initCube();
        this.initCylinder();
        this.initSphere();
        this.initDynamicCubeMap();
        this.initShadowFramebuffer();
        //
        this.resizeCanvas();
        this.skyboxProgram = this.compileShader(this.SKYBOX_VSHADER, this.SKYBOX_FSHADER);
        this.shadowProgram = this.compileShader(this.SHADOW_VSHADER, this.SHADOW_FSHADER);
        window.addEventListener('resize', () => this.resizeCanvas());
        return true;
    },

    shadowFramebuffer: null,
    shadowDepthTexture: null,
    shadowMapSize: 1024, // 陰影解析度，1024x1024 鋸齒感較低，RTX 4060 跑這個輕輕鬆鬆

    initShadowFramebuffer: function() {
        let gl = this.gl;

        // 1. 建立 Framebuffer
        this.shadowFramebuffer = gl.createFramebuffer();

        // 2. 建立一組高品質的 2D 紋理用來存深度
        this.shadowDepthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture);
        // 注意：這裡使用 DEPTH_COMPONENT 讓 WebGL 專門用來存高精度深度值
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, this.shadowMapSize, this.shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // 3. 把這張深度貼圖綁定給 Framebuffer 的 DEPTH_ATTACHMENT
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowDepthTexture, 0);

        // 核心安全檢查：WebGL 要求如果不畫顏色，必須明確告訴 Framebuffer 不要寫入顏色緩衝區
        // 在 WebGL 1 / WebGL 2 中，我們可以綁定一個空的或不做 color attachment，並確保不引發不完整報錯

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

    drawScene: function(projMatrix, viewMatrix, gameState) {
        // --- 這裡放你原本 draw 裡面的所有 Blockout 與繪製邏輯 ---

        if (gameState.obMode) {
            // 用深藍色的圓柱體當作警衛的身體
            this.drawCylinder(projMatrix, viewMatrix, gameState.guardX, gameState.guardY - 0.7, gameState.guardZ, 0.4, 0.8, 0.4,  0.1, 0.2, 0.5);
            // 用膚色的方塊當作頭部，並且會隨著滑鼠轉動！(教授最愛看這種動態互動)
            this.drawRotatedBlock(projMatrix, viewMatrix, gameState.guardX, gameState.guardY + 0.3, gameState.guardZ, 0.3, 0.3, 0.3, gameState.guardYaw,  0.9, 0.7, 0.6);
        }

        // 1. 警衛室地板
        this.drawBlock(projMatrix, viewMatrix, 0, 0, 11,  4, 0.1, 3,  0.3, 0.3, 0.3);
        // 2. 辦公桌
        this.drawBlock(projMatrix, viewMatrix, 0, 1, 10,  1.5, 0.1, 0.5,  0.4, 0.2, 0.1);
        this.drawBlock(projMatrix, viewMatrix, -1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix,  1.2, 0.5, 10,  0.1, 0.5, 0.4,  0.4, 0.2, 0.1); 

        // ⭐ 水晶球底座（留著底座，不要在這裡畫 drawSphere 喔！）
        this.drawBlock(projMatrix, viewMatrix,  -0.6, 1.1, 10.0,  0.15, 0.01 , 0.15,  0.4, 0.2, 0.1);

        // 3. 正前方牆壁
        this.drawBlock(projMatrix, viewMatrix, -3.0, 2.5, 8,  0.75, 2.5, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, -1.5, 0.8, 8,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, -1.5, 4.2, 8,  1.5, 0.8, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 0.5, 2.5, 8,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 2, 4, 8,  1, 1, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 3.5, 2.5, 8,  0.5, 2.5, 0.2,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 2, gameState.rightDoorY, 8, 1.25 ,2 , 0.15,  0.2, 0.25, 0.3);

        // 4. 左邊牆壁
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 9,  0.2, 2.5, 1,  0.2, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, -4, 2.5, 13.0, 0.2, 2.5, 1.0, 0.2, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, -4, 4, 11.25,  0.2, 1, 1.3, 0.2, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, -4, gameState.leftDoorY, 11.25,  0.15, 1.5, 1.1,  0.2, 0.25, 0.3);

        // 5. 右邊牆壁
        this.drawBlock(projMatrix, viewMatrix, 4, 2.5, 11,  0.2, 2.5, 3,  0.2, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 3.8, 1.0, 12,  0.3, 1, 1,  0.05, 0.05, 0.05); 
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 14,  4, 2.5, 0.2,  0.2, 0.3, 0.3);

        // 大地板與圍牆
        this.drawBlock(projMatrix, viewMatrix, 0, -0.05, -10,  25, 0.1, 25 ,  0.2, 0.2, 0.25);
        this.drawBlock(projMatrix, viewMatrix, 30, -0.05, -10,  15, 0.1, 25 ,  0.2, 0.2, 0.25); 
        this.drawBlock(projMatrix, viewMatrix, 0, -0.05, 30,  25, 0.1, 25 ,  0.2, 0.2, 0.25);
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, -35,  25, 2.5, 0.5,   0.5, 0.15, 0.15);
        this.drawBlock(projMatrix, viewMatrix, -25, 2.5, -10,  0.5, 2.5, 25,  0.5, 0.15, 0.15);
        this.drawBlock(projMatrix, viewMatrix, 25, 2.5, -10,  0.5, 2.5, 25,  0.5, 0.15, 0.15);
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, 15,  25, 2.5, 0.5,   0.5, 0.15, 0.15);

        // 用餐區長桌
        this.drawBlock(projMatrix, viewMatrix, -7.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, -3.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, 3.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, 7.5, 1, -22,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, -7.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, -3.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, 3.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, 7.5, 1, -10,  0.8, 0.1, 5,   0.4, 0.2, 0.1); 
        this.drawBlock(projMatrix, viewMatrix, 18, 2, -16,  2.0 , 0.1, 5,   1, 0.5, 1); 
        this.drawBlock(projMatrix, viewMatrix, 18, 1, -16,  1 , 1, 1,    1, 0.5, 1);

        // 舞台與海盜灣
        this.drawBlock(projMatrix, viewMatrix, 0, 0.5, -32,  10, 0.5, 2.5,   0.3, 0.2, 0.1);
        this.drawBlock(projMatrix, viewMatrix, 0, 3, -34.5,  8.5, 4, 0.2,   0.1, 0.1, 0.1);
        this.drawCylinder(projMatrix, viewMatrix, -18, 0.5, -18,  3.0, 0.5, 3.0,  0.2, 0.1, 0.3);
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -21,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -21.5, 2, -18,  0.2, 2.5, 3.5,   0.3, 0.1, 0.4);
        this.drawBlock(projMatrix, viewMatrix, -18, 2, -15,  3.5, 2.5, 0.2,   0.3, 0.1, 0.4);

        // 隔壁與通風管
        this.drawBlock(projMatrix, viewMatrix, -11, 2.5, 2,  8, 2.5, 0.2,  0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix,  14, 2.5, 2,  11, 2.5, 0.2,  0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, 0, 2.5, -4.5,  10, 2.5, 0.2,  0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, -3.2, 2.5, 5,  0.2, 2.5, 3,   0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix,  3.2, 2.5, 5,  0.2, 2.5, 3,   0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, -11, 2.5, 9, 7, 2.5, 0.2,  0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, -5.5, 2.5, 5.5,  0.2, 2.5, 3.5,   0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, -17.8, 2.5, 7.5,  0.2, 2.5, 1.5,   0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix, -17.8, 2.5, 2.8,  0.2, 2.5, 0.75,   0.5, 0.15, 0.15); 
        this.drawBlock(projMatrix, viewMatrix,  15, 1.5, 10,  11, 1.5, 0.2, 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  15, 3, 11.5,  11, 0.2 , 1.5 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  15, 1.5, 13,  11, 1.5, 0.2, 0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix,  25, 1.5, -14,  2, 1.5, 0.2, 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  25, 3, -12.5,  2, 0.2 , 1.5 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix,  25, 1.5, -11,  2, 1.5, 0.2, 0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 24, 1.5, -12.5,  0.1, 1.3 , 1.3 , 0, 0, 0); 
        this.drawBlock(projMatrix, viewMatrix, 26, 1.5, -10,  0.2, 1.25, 25,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 27.5, 3, -10,  1.5, 0.2 , 25 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 29, 1.5, -10,  0.2, 1.25, 25,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 11, 1.5, 5.5,  0.2, 1.25, 4.5,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 12.5, 3, 5.5,  1.5, 0.2 , 4.5 , 0.3, 0.3, 0.3); 
        this.drawBlock(projMatrix, viewMatrix, 14, 1.5, 5.5,  0.2, 1.25, 4.5,  0.3, 0.3, 0.3);
        this.drawBlock(projMatrix, viewMatrix, 12.5, 1.5, 1,  1.3, 1.3 , 0.1 , 0, 0, 0); 

        // 電風扇
        let fX = 0.8, fY = 1.1, fZ = 10.1; 
        this.drawCylinder(projMatrix, viewMatrix, fX, fY, fZ, 0.15, 0.02, 0.15, 0.2, 0.2, 0.2);
        this.drawCylinder(projMatrix, viewMatrix, fX, fY + 0.1, fZ, 0.02, 0.1, 0.02, 0.2, 0.2, 0.2);
        this.drawBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ, 0.08, 0.08, 0.1, 0.2, 0.2, 0.2);
        this.drawRotatedBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ + 0.11, 0.02, 0.15, 0.01, gameState.fanAngle, 0.05, 0.05, 0.05);
        this.drawRotatedBlock(projMatrix, viewMatrix, fX, fY + 0.2, fZ + 0.11, 0.15, 0.02, 0.01, gameState.fanAngle, 0.05, 0.05, 0.05);

        // 畫四隻熊熊（Bonnie, Freddy, Chica, Foxy... 直接借用你原本代碼中的渲染邏輯）
        this.drawAnimatronics(projMatrix, viewMatrix, gameState);
    },

    // 輔助拆分函數：把熊熊渲染包進來
    drawAnimatronics: function(projMatrix, viewMatrix, gameState) {
        if (Renderer.models && Renderer.models.bonnieNormal) {
            let bLoc = gameState.bonnie.location; let bScale = 0.04;
            let currentBonnie = Renderer.models.bonnieNormal;
            if (bLoc === 'cam1') this.drawCharacter(projMatrix, viewMatrix, -4, 1, -32, bScale, bScale, bScale, 0, currentBonnie); 
            else if (bLoc === 'cam2') this.drawCharacter(projMatrix, viewMatrix, 0, 1, -11, bScale, bScale, bScale, -30, Renderer.models.bonnieCam2); 
            else if (bLoc === 'cam4') this.drawCharacter(projMatrix, viewMatrix, 8, 1, 2, bScale, bScale, bScale, -45, currentBonnie); 
            else if (bLoc === 'cam6') this.drawCharacter(projMatrix, viewMatrix, -18, 0, 13, bScale, bScale, bScale, 90, Renderer.models.bonnieCam6); 
            else if (bLoc === 'cam7') this.drawCharacter(projMatrix, viewMatrix, -11, 0, 7.8, bScale, bScale, bScale, 145, Renderer.models.bonnieCam7);  
            else if (bLoc === 'door' && gameState.leftLightOn) this.drawCharacter(projMatrix, viewMatrix, -5.5, 0, 11, 0.03, 0.03, 0.03, 90, currentBonnie); 
            else if (bLoc === 'jumpscare') {
                let shakeX = Math.sin(gameState.time * 50) * 0.1; let shakeY = Math.cos(gameState.time * 70) * 0.1;
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -1 + shakeY, 11, 0.03, 0.03, 0.03, 0, Renderer.models.bonnieAttack); 
            }
        }
        if (Renderer.models && Renderer.models.freddyNormal) {
            let loc = gameState.freddy.location; let fScale = 1.8;
            if (loc === 'cam1') this.drawCharacter(projMatrix, viewMatrix, 3, 1, -32, fScale, fScale, fScale, 0, Renderer.models.freddyNormal); 
            else if(loc === 'cam2') this.drawCharacter(projMatrix, viewMatrix, 10, 0, -18, fScale, fScale, fScale, 55, Renderer.models.freddyNormal); 
            else if(loc === 'cam5') this.drawCharacter(projMatrix, viewMatrix, 21, 0, -10, fScale, fScale, fScale, 135, Renderer.models.freddyDown); 
            else if(loc === 'cam8') this.drawCharacter(projMatrix, viewMatrix, 27.5, 0, 6, 1.4, 1.4, 1.4, 0, Renderer.models.freddyVent); 
            else if(loc === 'cam4') this.drawCharacter(projMatrix, viewMatrix, 7, 0, 0, fScale, fScale, fScale, 180, Renderer.models.freddyOut); 
            else if (loc === 'door' && gameState.powerOutPhase === 1) this.drawCharacter(projMatrix, viewMatrix, -0.5, 0, 5, fScale, fScale, fScale, 0, Renderer.models.freddyAttack);
            else if (loc === 'jumpscare') {
                let shakeX = Math.sin(gameState.time * 50) * 0.1; let shakeY = Math.cos(gameState.time * 70) * 0.1;
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 11, fScale, fScale, fScale, 0, Renderer.models.freddyAttack); 
            }
        }
        if (Renderer.models && Renderer.models.chicaNormal) {
            let loc = gameState.chica.location; let CScale = 0.045;
            if (loc === 'cam1') this.drawCharacter(projMatrix, viewMatrix, 0, 1, -32, CScale, CScale, CScale, 0, Renderer.models.chicaNormal); 
            else if(loc === 'cam2') this.drawCharacter(projMatrix, viewMatrix, -2, 0, -9, CScale, CScale, CScale, 90, Renderer.models.chicaCam2); 
            else if(loc === 'cam4') this.drawCharacter(projMatrix, viewMatrix, 9, 0, -3, CScale, CScale, CScale, 200 , Renderer.models.chicaCam4); 
            else if (loc === 'door' && gameState.rightLightOn) this.drawCharacter(projMatrix, viewMatrix, -0.5, 0, 5, CScale, CScale, CScale, 0, Renderer.models.chicaNormal); 
            else if (loc === 'jumpscare') {
                let shakeX = Math.sin(gameState.time * 50) * 0.1; let shakeY = Math.cos(gameState.time * 70) * 0.1;
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 10, CScale, CScale, CScale, 0, Renderer.models.chicaAttack); 
            }
        }
        if (Renderer.models && Renderer.models.foxyNormal) {
            let loc = gameState.foxy.location; let foxyScale = 0.2;
            if (loc === 'cam3') {
                let m = Renderer.models.foxyNormal;
                if(gameState.foxy.phase === 1) m = Renderer.models.foxyP1;
                else if(gameState.foxy.phase === 2) m = Renderer.models.foxyP2;
                else if(gameState.foxy.phase === 3) m = Renderer.models.foxyP3;
                this.drawCharacter(projMatrix, viewMatrix, -18, 1, -18, foxyScale, foxyScale, foxyScale, 90, m); 
            } else if (loc === 'cam6') {
                let isLeftFoot = Math.floor(Date.now() / 150) % 2 === 0; 
                let currentModel = isLeftFoot ? Renderer.models.foxyL : Renderer.models.foxyR;
                let currentX = -18 + (16) * (gameState.foxy.runProgress || 0);
                if (currentModel) this.drawCharacter(projMatrix, viewMatrix, currentX, 0, 11, foxyScale, foxyScale, foxyScale, 90, currentModel);
            } else if (loc === 'jumpscare') {
                let shakeX = Math.sin(gameState.time * 50) * 0.1; let shakeY = Math.cos(gameState.time * 70) * 0.1;
                this.drawCharacter(projMatrix, viewMatrix, shakeX, -2 + shakeY, 11, foxyScale, foxyScale, foxyScale, 0, Renderer.models.foxyNormal); 
            }
        }
    },


    initSphere: function() {
        let segments = 32; // 分段數，越多越圓滑
        let positions = [];
        let normals = [];
        let indices = [];

        for (let y = 0; y <= segments; y++) {
            let theta = y * Math.PI / segments;
            let sinTheta = Math.sin(theta);
            let cosTheta = Math.cos(theta);

            for (let x = 0; x <= segments; x++) {
                let phi = x * 2 * Math.PI / segments;
                let sinPhi = Math.sin(phi);
                let cosPhi = Math.cos(phi);

                let xPos = cosPhi * sinTheta;
                let yPos = cosTheta;
                let zPos = sinPhi * sinTheta;

                positions.push(xPos, yPos, zPos);
                normals.push(xPos, yPos, zPos); // 球體的法線等於歸一化的位置
            }
        }

        // 連接三角形頂點
        for (let y = 0; y < segments; y++) {
            for (let x = 0; x < segments; x++) {
                let p1 = (y * (segments + 1)) + x;
                let p2 = p1 + (segments + 1);
                indices.push(p1, p2, p1 + 1);
                indices.push(p1 + 1, p2, p2 + 1);
            }
        }

        // 轉為 Buffer
        let vBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        let nBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);

        let iBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, iBuffer);
        // 球體頂點數通常超過 256，必須用 Uint16Array (UNSIGNED_SHORT)
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.sphereBufferInfo = { 
            vertexBuffer: vBuffer, 
            normalBuffer: nBuffer, 
            indexBuffer: iBuffer,
            indexCount: indices.length 
        };
    },

    drawSphere: function(proj, view, tx, ty, tz, sx, sy, sz, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);
        modelMatrix.scale(sx, sy, sz); 

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        let gl = this.gl;
        gl.useProgram(this.program);

        gl.uniform1i(gl.getUniformLocation(this.program, 'u_UseTexture'), 0); 
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_BaseColor'), r, g, b); 

        // 強度拉到 1.0 純鏡面！
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_EnvReflectWeight'), 1.0);
        
        // 【動態鏡面核心】綁定我們自己動態渲染出來的 dynamicCubeTexture！
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.dynamicCubeTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_SkyboxSampler'), 2); // 告訴 Shader 讀取單元 2

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereBufferInfo.vertexBuffer);
        let a_Position = gl.getAttribLocation(this.program, 'a_Position');
        gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Position);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereBufferInfo.normalBuffer);
        let a_Normal = gl.getAttribLocation(this.program, 'a_Normal');
        gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Normal);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphereBufferInfo.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.sphereBufferInfo.indexCount, gl.UNSIGNED_SHORT, 0);
    },

    drawSkybox: function(proj, view, camX, camY, camZ) {
        if (!this.skyboxTexture) return; 

        let gl = this.gl;
        gl.useProgram(this.skyboxProgram);

        gl.depthMask(false); 

        let modelMatrix = new Matrix4();
        //  修正：讓天空盒中心永遠固定在攝影機的 (camX, camY, camZ)
        modelMatrix.translate(camX, camY, camZ);
        // 將放大倍率稍微拉大到 150 倍，配合我們剛才放寬到 300 的遠裁剪面
        modelMatrix.scale(100.0, 100.0, 100.0); 

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.skyboxProgram, 'u_MvpMatrix'), false, mvpMatrix.elements);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
        gl.uniform1i(gl.getUniformLocation(this.skyboxProgram, 'u_Skybox'), 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBufferInfo.vertexBuffer);
        let a_Position = gl.getAttribLocation(this.skyboxProgram, 'a_Position');
        gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(a_Position);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeBufferInfo.indexBuffer);
        
        gl.disable(gl.CULL_FACE); 
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);

        gl.depthMask(true); 
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
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_EnvReflectWeight'), 0.0);
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
    dynamicFramebuffer: null,
    dynamicCubeTexture: null,
    dynamicCubeMapSize: 512, // 鏡面解析度，512x512 效果極佳且兼顧效能
    

    initDynamicCubeMap: function() {
        let gl = this.gl;
        
        // 1. 建立 Framebuffer
        this.dynamicFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dynamicFramebuffer);

        // 2. 建立動態遠端環境 Cube Map 紋理
        this.dynamicCubeTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.dynamicCubeTexture);

        // 初始化 6 個面向（先留空，等著每幀寫入）
        for (let i = 0; i < 6; i++) {
            gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 
                gl.RGBA, this.dynamicCubeMapSize, this.dynamicCubeMapSize, 0, 
                gl.RGBA, gl.UNSIGNED_BYTE, null
            );
        }

        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // 3. 建立渲染緩衝區（Depth Buffer），用於 6 個面向渲染時的深度測試
        let renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.dynamicCubeMapSize, this.dynamicCubeMapSize);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

        // 解除綁定
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },


    // WebGL.js 內部，放在 loadTexture 下方// WebGL.js 內部，放在 loadTexture 下方// WebGL.js 內部，放在 loadTexture 下方
    loadCubeMap: function(urlsOrPath) {
        let gl = this.gl;
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

        //  自動相容轉換：如果傳進來的是字串 'assets'，自動拼裝 6 個面的路徑
        let urls = {};
        if (typeof urlsOrPath === 'string') {
            let basePath = urlsOrPath.endsWith('/') ? urlsOrPath : urlsOrPath + '/';
            urls = {
                px: basePath + 'px.jpg',
                nx: basePath + 'nx.jpg',
                py: basePath + 'py.jpg',
                ny: basePath + 'ny.jpg',
                pz: basePath + 'pz.jpg',
                nz: basePath + 'nz.jpg'
            };
        } else {
            urls = urlsOrPath;
        }

        const targets = [
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: urls.px }, 
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: urls.nx }, 
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: urls.py }, 
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: urls.ny }, 
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: urls.pz }, 
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: urls.nz }  
        ];

        // 先用 1x1 的黑色填滿 6 個面，避免初期報錯
        for (let i = 0; i < 6; i++) {
            gl.texImage2D(targets[i].target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        }

        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        let loadedCount = 0; //  新增：載入計數器

        targets.forEach((item) => {
            let image = new Image();
            image.onload = () => {
                gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
                gl.texImage2D(item.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                loadedCount++; // 每載入一張就 +1
                
                //  核心修正：必須等 6 張都載入完畢，才能呼叫 Mipmap 組裝！
                if (loadedCount === 6) {
                    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
                    console.log("🌌 Skybox 6張圖片全部載入並組合完成！");
                }
            };
            image.onerror = () => {
                console.error("❌ Skybox 圖片找不到或載入失敗: " + item.url);
            };
            image.src = item.url;
        });

        this.skyboxTexture = texture; 
        return texture;
    },
    skyboxTexture: null,


    drawRotatedBlock: function(proj, view, tx, ty, tz, sx, sy, sz, angle, r, g, b) {
        let modelMatrix = new Matrix4();
        modelMatrix.translate(tx, ty, tz);      
        modelMatrix.rotate(angle, 0, 0, 1);     
        modelMatrix.scale(sx, sy, sz);          

        let mvpMatrix = new Matrix4();
        mvpMatrix.set(proj).multiply(view).multiply(modelMatrix);
        
        let normalMatrix = new Matrix4();
        normalMatrix.setInverseOf(modelMatrix).transpose();

        let gl = this.gl;
        gl.useProgram(this.program);

        gl.uniform1i(gl.getUniformLocation(this.program, 'u_UseTexture'), 0);
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_BaseColor'), r, g, b);

        // 🔥【核心新增】開啟環境貼圖反射！並傳入 0.6 的強度（變成電鍍金屬鏡面外觀）
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_EnvReflectWeight'), 0.6);
        
        // 將已經加載的天空盒紋理（TEXTURE1）傳遞給主著色器中的環境採樣器
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_SkyboxSampler'), 1);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_MvpMatrix'), false, mvpMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_ModelMatrix'), false, modelMatrix.elements);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_normalMatrix'), false, normalMatrix.elements);

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
        if (this.isDrawingShadow) {
            gl.useProgram(this.shadowProgram);
            gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProgram, 'u_MvpMatrix'), false, mvpMatrix.elements);
            
            let a_Position = gl.getAttribLocation(this.shadowProgram, 'a_Position');
            for (let i = 0; i < components.length; i++) {
                let comp = components[i];
                this.initAttributeVariable(a_Position, comp.vertexBuffer);
                gl.drawArrays(gl.TRIANGLES, 0, comp.numVertices);
            }
            return; 
        }
        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_EnvReflectWeight'), 0.0);
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
        let gl = this.gl;

        // 右門探照燈的世界座標 (從你的燈 7 陣列中提取)
        let lX = 1.0, lY = 4.0, lZ = 6.0; 

        let shadowProj = new Matrix4();
        let shadowView = new Matrix4();
        // 探照燈具有方向性，利用 perspective 模擬聚光燈圓錐，視野設為 90 度，遠景 50 即可
        shadowProj.setPerspective(90, 1.0, 0.1, 50);
        // 讓探照燈精準看向右側牆壁門口的方向（朝 X 軸正方向、Z 軸稍靠後看過去）
        shadowView.setLookAt(lX, lY, lZ,  -1.5, 2.0, 5.0,  0, 1, 0);

        let lightMvpMatrix = new Matrix4(); 
        // 這是光源專用的 MVP 基礎（此處不包含 Model，在物體繪製時會各自 multiply）
        lightMvpMatrix.set(shadowProj).multiply(shadowView);

        // 綁定到陰影 Framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        // 切換到輕量級的 shadowProgram
        gl.useProgram(this.shadowProgram);

       
        // 為了不破壞原本函數的 Shader 綁定，我們需要讓 drawBlock 等函數知道現在是在畫影子還是畫彩色。
        // 最快速安全的解法是：在 Renderer 上掛一個標記 Renderer.isDrawingShadow = true;
        this.isDrawingShadow = true;
        this.drawScene(shadowProj, shadowView, gameState);
        this.isDrawingShadow = false; // 畫完影子，立刻解開標記


        // ----------------------------------------------------
        // 🔄【通道 1 ~ 6】DYNAMIC CUBE MAP PASS (保持原本的水晶球反射不變)
        // ----------------------------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dynamicFramebuffer);
        gl.viewport(0, 0, this.dynamicCubeMapSize, this.dynamicCubeMapSize);
        let dynProj = new Matrix4();
        dynProj.setPerspective(90, 1.0, 0.1, 100);
        let sX = -0.6, sY = 1.3, sZ = 10.0;
        const cubeFaces = [
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, look: [sX+1, sY, sZ],  up: [0, -1, 0] },
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, look: [sX-1, sY, sZ],  up: [0, -1, 0] },
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, look: [sX, sY+1, sZ],  up: [0, 0, 1]  },
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, look: [sX, sY-1, sZ],  up: [0, 0, -1] },
            { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, look: [sX, sY, sZ+1],  up: [0, -1, 0] },
            { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, look: [sX, sY, sZ-1],  up: [0, -1, 0] }
        ];
        gl.useProgram(this.program);
        this.setupLights(gameState);
        cubeFaces.forEach(face => {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, face.target, this.dynamicCubeTexture, 0);
            gl.clearColor(0.05, 0.05, 0.05, 1.0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            let dynView = new Matrix4();
            dynView.setLookAt(sX, sY, sZ, face.look[0], face.look[1], face.look[2], face.up[0], face.up[1], face.up[2]);
            this.drawSkybox(dynProj, dynView, sX, sY, sZ);
            gl.useProgram(this.program);
            // 在主 Shader 中傳入光的 MVP 矩陣，避免場景繪製出錯
            gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_LightMvpMatrix'), false, lightMvpMatrix.elements);
            this.drawScene(dynProj, dynView, gameState);
        });


        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.resizeCanvas();
        gl.clearColor(0.05, 0.05, 0.05, 1.0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        camX = gameState.guardX; 
        camY = gameState.guardY; 
        camZ = gameState.guardZ;
        let projMatrix = new Matrix4();
        let viewMatrix = new Matrix4();
        projMatrix.setPerspective(60, this.canvas.width / this.canvas.height, 0.1, 300);

        if (gameState.obMode) {
            camX = gameState.obCam.x; camY = gameState.obCam.y; camZ = gameState.obCam.z;
            let pitchRad = gameState.obCam.pitch * Math.PI / 180; let yawRad = gameState.obCam.yaw * Math.PI / 180;
            let fX = Math.sin(yawRad) * Math.cos(pitchRad); let fY = Math.sin(pitchRad); let fZ = -Math.cos(yawRad) * Math.cos(pitchRad);
            viewMatrix.setLookAt(camX, camY, camZ, camX + fX, camY + fY, camZ + fZ, 0, 1, 0);
        } else if (gameState.isMonitorOpen && gameState.power > 0) {    
            switch (gameState.currentCam) {
                case 'cam1': camX = 8;  camY = 6;   camZ = -18; viewMatrix.setLookAt(8, 6, -18,  0, 2, -30,  0, 1, 0); break;
                case 'cam2': camX = 0;  camY = 6;   camZ = -6;  viewMatrix.setLookAt(0, 6, -6,   0, 1, -12,  0, 1, 0); break;
                case 'cam3': camX = -6; camY = 6;   camZ = -15; viewMatrix.setLookAt(-6, 6, -15, -12, 3, -16,  0, 1, 0); break;
                case 'cam4': camX = 8;  camY = 4;   camZ = -4;  viewMatrix.setLookAt(8, 4, -4,   10, 2, 2,   0, 1, 0); break;
                case 'cam5': camX = 10; camY = 8;   camZ = -20; viewMatrix.setLookAt(10, 8, -20, 18, 2,-16,  0, 1, 0); break;
                case 'cam6': camX = -5; camY = 3;   camZ = 12;  viewMatrix.setLookAt(-5, 3, 12 , -23, 2, 9,   0, 1, 0); break;
                case 'cam7': camX = -8; camY = 4.5; camZ = 8;   viewMatrix.setLookAt(-8, 4.5, 8 ,-16, 1, 6,   0, 1, 0); break;
                case 'cam8': camX = 27.5;camY = 2;  camZ = 14;  viewMatrix.setLookAt(27.5, 2, 14,24, 3, -8.5, 0, 1, 0); break;
            }
        } else {
            let eyeX = gameState.guardX, eyeY = gameState.guardY, eyeZ = gameState.guardZ; 
            let radian = gameState.guardYaw * Math.PI / 180;
            let targetX = eyeX - Math.sin(radian);
            let targetZ = eyeZ - Math.cos(radian);
            viewMatrix.setLookAt( eyeX, eyeY, eyeZ, targetX, eyeY, targetZ, 0, 1, 0 );
        }

        let isFlickering = gameState.isMonitorOpen && gameState.flickerTimer > 0 && gameState.power > 0 && gameState.flickerCams.includes(gameState.currentCam);
        if (isFlickering) {
            gl.clearColor(0.0, 0.0, 0.0, 1.0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            return; 
        }

        this.drawSkybox(projMatrix, viewMatrix, camX, camY, camZ);

        gl.useProgram(this.program);
        this.setupLights(gameState);
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_EyePos'), camX, camY, camZ);
        
        // 傳入光的 MVP 矩陣與剛剛畫好的 Shadow Map 紋理給主要 Shader
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_LightMvpMatrix'), false, lightMvpMatrix.elements);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_ShadowMap'), 3); // 綁定在單元 3

        // 正常畫出整個世界
        this.drawScene(projMatrix, viewMatrix, gameState);
        // 畫出水晶球
        this.drawSphere(projMatrix, viewMatrix, -0.6, 1.3, 10.0,  0.15, 0.15, 0.15,  1.0, 1.0, 1.0);
    },

    // 抽離出來的燈光設定工具函數
    setupLights: function(gameState) {
        let gl = this.gl;
        let officeR = 1.6, officeG = 1.4, officeB = 1.0;
        if (gameState.isPowerOut) {
            if (gameState.powerOutPhase === 1) {
                let flicker = (Math.random() > 0.5) ? 0.15 : 0.02;
                officeR = flicker; officeG = flicker; officeB = flicker;
            } else if (gameState.powerOutPhase === 2){
                officeR = 0.3; officeG = 0.3; officeB = 0.3;
            } else if (gameState.powerOutPhase === 3){
                officeR = 1.0; officeG = 1.0; officeB = 1.0;
            }
        }
        let lightPositions = new Float32Array([
            0.0, 4.5, 10.0,  0.0, 6, -32.0,  -18.0, 3.5, -18.0, -23, 2, 9,  10, 4, 2,  0, 1, -12,
            -5.0, 4, 11.25,  0.0, 4, 6.0,  -16, 1, 6,  18, 2,-16,  -1.5, 2, 9
        ]);
        let lightColors = new Float32Array([
            officeR, officeG, officeB,  1.6, 1.6, 2.4,  1.0, 0.1, 0.1,
            !gameState.isPowerOut ? 0.7 : 0.0, !gameState.isPowerOut ? 0.7 : 0.0, !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 0.7 : 0.0, !gameState.isPowerOut ? 0.7 : 0.0, !gameState.isPowerOut ? 0.7 : 0.0,
            !gameState.isPowerOut ? 1.5 : 0.0, !gameState.isPowerOut ? 1.5 : 0.0, !gameState.isPowerOut ? 1.5 : 0.0,
            (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, (!gameState.isPowerOut && gameState.leftLightOn) ? 1.5 : 0.0, 
            (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0, (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0, (!gameState.isPowerOut && gameState.rightLightOn) ? 1.5 : 0.0,
            0.8, 0.7, 0.5,  1.5, 1.5, 1.5,
            (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0, (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0, (gameState.isPowerOut && gameState.powerOutPhase === 1) ? 1.0 : 0.0
        ]);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_LightPos'), lightPositions);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_LightColor'), lightColors);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_Shininess'), 32.0); 
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_MaterialSpecular'), 1.0, 1.0, 1.0);
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
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_EnvReflectWeight'), 0.0);
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