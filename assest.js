// assets.js

// assets.js 或 WebGL.js 內
function parseOBJ(objText) {
    let positions = [];
    let normals = [];
    let texCoords = [];
    let vertices = []; // 最終輸出的頂點資料

    // 暫存陣列
    let pTemp = [];
    let nTemp = [];
    let tTemp = [];

    let lines = objText.split('\n');
    for (let line of lines) {
        let parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') pTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'vn') nTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'vt') tTemp.push(+parts[1], +parts[2]);
        else if (parts[0] === 'f') {
            for (let i = 1; i <= 3; i++) {
                let subParts = parts[i].split('/');
                let pIdx = (parseInt(subParts[0]) - 1) * 3;
                let tIdx = (parseInt(subParts[1]) - 1) * 2;
                let nIdx = (parseInt(subParts[2]) - 1) * 3;

                // 組合成 WebGL 需要的連續陣列
                vertices.push(pTemp[pIdx], pTemp[pIdx+1], pTemp[pIdx+2]); // Position
                vertices.push(nTemp[nIdx], nTemp[nIdx+1], nTemp[nIdx+2]); // Normal
                vertices.push(tTemp[tIdx], 1.0 - tTemp[tIdx+1]);         // UV (Y軸通常需要翻轉)
            }
        }
    }
    return new Float32Array(vertices);
}

// assets.js
// assets.js

// 🌟 必須直接寫在最外層，不能包在 window.onload 裡面！
async function loadOBJModel(url) {
    console.log("正在載入模型路徑: ", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP 錯誤! 狀態碼: " + response.status);
    
    const objText = await response.text();
    
    let pTemp = [], nTemp = [], tTemp = [];
    let vertices = [];

    const lines = objText.split('\n');
    for (let line of lines) {
        let parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') pTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'vn') nTemp.push(+parts[1], +parts[2], +parts[3]);
        else if (parts[0] === 'vt') tTemp.push(+parts[1], +parts[2]);
        else if (parts[0] === 'f') {
            for (let i = 1; i <= 3; i++) {
                let subParts = parts[i].split('/');
                let pIdx = (parseInt(subParts[0]) - 1) * 3;
                let tIdx = (parseInt(subParts[1]) - 1) * 2;
                let nIdx = (parseInt(subParts[2]) - 1) * 3;

                // Position
                vertices.push(pTemp[pIdx], pTemp[pIdx+1], pTemp[pIdx+2]);
                // Normal
                vertices.push(nTemp[nIdx], nTemp[nIdx+1], nTemp[nIdx+2]);
                // UV
                vertices.push(tTemp[tIdx], 1.0 - tTemp[tIdx+1]);
            }
        }
    }
    return {
        data: new Float32Array(vertices),
        count: vertices.length / 8
    };
}

const Assets = {
    models: {}, // 存放解析好的模型資料

    // 載入所有模型 (這是一個 async 函數，因為讀檔案需要時間)
    loadAll: async function(gl) {
        console.log("開始載入模型...");
        
        // 假設你把 parseOBJ 寫在這裡
        let roomText = await (await fetch('models/room.obj')).text();
        this.models.room = this.createBufferInfo(gl, parseOBJ(roomText));

        let doorText = await (await fetch('models/door.obj')).text();
        this.models.door = this.createBufferInfo(gl, parseOBJ(doorText));
        
        console.log("模型載入完成！");
        return true;
    },

    // 將 parseOBJ 的結果轉成 WebGL Buffer 的輔助函數
    createBufferInfo: function(gl, objData) {
        // ... 在這裡建立 ARRAY_BUFFER 並綁定頂點、法線等 ...
        return {
            vertexBuffer: vBuffer,
            normalBuffer: nBuffer,
            vertexCount: objData.vertices.length / 3
        };
    }
};

window.loadOBJModel = loadOBJModel;