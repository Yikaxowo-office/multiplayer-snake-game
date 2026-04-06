const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

let players = {};
let foods = {}; // 改用物件來儲存多個食物
let baseSpeed = 3;

const WORLD_RADIUS = 1500;
const WORLD_CENTER = { x: 1500, y: 1500 };
const MAX_FOODS = 150; // 地圖上同時存在的食物數量
let foodIdCounter = 0;

// 生成單個食物的邏輯 (給予不同大小與分數)
function spawnSingleFood() {
    let angle = Math.random() * Math.PI * 2;
    let radius = Math.random() * (WORLD_RADIUS - 20); 
    let x = WORLD_CENTER.x + radius * Math.cos(angle);
    let y = WORLD_CENTER.y + radius * Math.sin(angle);
    
    let type = Math.random();
    let size, pts, color;
    if (type > 0.9) { size = 15; pts = 30; color = "#f1c40f"; } // 10% 金色大食物
    else if (type > 0.6) { size = 10; pts = 15; color = "#e67e22"; } // 30% 橘色中食物
    else { size = 6; pts = 5; color = "#e74c3c"; } // 60% 紅色小食物

    let id = foodIdCounter++;
    let newFood = { id, x, y, size, pts, color };
    foods[id] = newFood;
    return newFood;
}

// 初始化地圖上的食物
for(let i=0; i<MAX_FOODS; i++) {
    spawnSingleFood();
}

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    players[socket.id] = {
        snake: [],
        score: 0,
        speed: baseSpeed
    };

    // 玩家一連線，就把所有食物傳給他
    socket.emit('initFoods', foods);

    socket.on('updatePos', (data) => {
        if (!players[socket.id] || !data.snake || data.snake.length === 0) return;
        const player = players[socket.id];
        player.snake = data.snake;

        if (data.isBoosting && player.snake.length > 5) {
            player.currentSpeed = player.speed * 1.5;
        } else {
            player.currentSpeed = player.speed;
        }
        
        let head = player.snake[0];
        if (!head) return;

        // 1. 食物同步判定 (檢查所有食物)
        for (let id in foods) {
            let f = foods[id];
            let distToFood = Math.sqrt(Math.pow(head.x - f.x, 2) + Math.pow(head.y - f.y, 2));
            
            if (distToFood < (15 + f.size)) { // 根據食物大小調整吃食範圍
                player.score += f.pts;
                player.speed = baseSpeed + (player.score / 50) * 0.5;
                
                delete foods[id];
                let newFood = spawnSingleFood(); // 補一顆新食物
                
                // 廣播「哪顆被吃了」以及「新長出哪顆」，節省流量
                io.emit('foodEaten', { eatenId: id, newFood: newFood });
                io.emit('scoreUpdate', { id: socket.id, score: player.score, speed: player.speed });
                break; // 一次最多吃一顆
            }
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
<<<<<<< HEAD
});
=======
});
>>>>>>> 62b3e0f05e7f3ed2e3bec545e6b016fe202eff99
