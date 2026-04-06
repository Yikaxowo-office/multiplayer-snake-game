const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

let players = {};
let food = { x: 300, y: 200 };
let baseSpeed = 3;

// 修改 server.js 中的 spawnFood
function spawnFood() {
    // 假設世界大小是 3000 x 3000
    food.x = Math.random() * 2900 + 50;
    food.y = Math.random() * 2900 + 50;
    io.emit('foodUpdate', food);
}

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    players[socket.id] = {
        snake: [],
        score: 0,
        speed: baseSpeed
    };

    socket.emit('foodUpdate', food);

    socket.on('updatePos', (data) => {
        //防呆檢查
        if (!players[socket.id]) return;
        const player = players[socket.id];
        player.snake = data.snake;

        // 接收來自客戶端的「是否正在加速」狀態
        if (data.isBoosting && player.snake.length > 5) {
            // 加速時，伺服器記錄該玩家當前速度加成
            player.currentSpeed = player.speed * 1.5;
        } else {
            player.currentSpeed = player.speed;
        }
        
        let head = player.snake[0];
        
        // 再次確保 head 存在才計算，避免讀取 head.x 報錯
        if (!head) return;

        
        // 1. 食物同步判定
        let distToFood = Math.sqrt(Math.pow(head.x - food.x, 2) + Math.pow(head.y - food.y, 2));
        
        if (distToFood < 20) { // 稍微加大判定範圍增加手感
            player.score += 10;
            player.speed = baseSpeed + (player.score / 50) * 0.5;
            spawnFood();
            io.emit('scoreUpdate', { id: socket.id, score: player.score, speed: player.speed });
        }

        // 2. 碰撞判定 (撞到別人)
        for (let otherId in players) {
            if (otherId === socket.id) continue;
            let otherSnake = players[otherId].snake;
            if (!otherSnake || otherSnake.length === 0) continue;

            for (let segment of otherSnake) {
                let distToEnemy = Math.sqrt(Math.pow(head.x - segment.x, 2) + Math.pow(head.y - segment.y, 2));
                if (distToEnemy < 10) {
                    socket.emit('die');
                    break; 
                }
            }
        }

        socket.broadcast.emit('enemyUpdate', {
            id: socket.id,
            snake: player.snake
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        console.log('玩家離開:', socket.id);
    });
});

const PORT = process.env.PORT || 3000; 

http.listen(PORT, () => {
    console.log(`伺服器正在運行，埠號：${PORT}`);
});
