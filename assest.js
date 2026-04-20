// assets.js
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