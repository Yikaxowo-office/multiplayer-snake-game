const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

let players = {};
let foods = {}; 
const baseSpeed = 3;

const WORLD_RADIUS = 3000;
const WORLD_CENTER = { x: 3000, y: 3000 };
const MAX_FOODS = 180; 
let foodIdCounter = 0;

function spawnSingleFood() {
    let angle = Math.random() * Math.PI * 2;
    let radius = Math.random() * (WORLD_RADIUS - 20); 
    let x = WORLD_CENTER.x + radius * Math.cos(angle);
    let y = WORLD_CENTER.y + radius * Math.sin(angle);
    
    let type = Math.random();
    let size, pts, color;
    if (type > 0.9) { size = 18; pts = 30; color = "#f1c40f"; } 
    else if (type > 0.8) { size = 14; pts = 24; color = "#79ed79"; }
    else if (type > 0.6) { size = 10; pts = 18; color = "#e67e22"; } 
    else { size = 6; pts = 9; color = "#e74c3c"; } 

    let id = foodIdCounter++;
    let newFood = { id, x, y, size, pts, color };
    foods[id] = newFood;
    return newFood;
}

for(let i=0; i<MAX_FOODS; i++) {
    spawnSingleFood();
}

function handlePlayerDeath(playerId) {
    const player = players[playerId];
    if (!player || !player.snake || player.snake.length === 0) return;

    let droppedFoods = {};
    for (let i = 0; i < player.snake.length; i += 3) {
        let seg = player.snake[i];
        let size = Math.min(8 + (player.score / 50), 18); 
        let pts = Math.floor(size * 1.5);
        // 如果玩家有皮膚顏色，掉落的食物有 50% 機率是玩家的顏色
        let color = Math.random() > 0.5 && player.color ? player.color : ["#f1c40f", "#e67e22", "#e74c3c", "#9b59b6", "#3498db"][Math.floor(Math.random() * 5)];
        
        let fid = foodIdCounter++;
        let newFood = { id: fid, x: seg.x, y: seg.y, size, pts, color };
        foods[fid] = newFood;
        droppedFoods[fid] = newFood;
    }
    
    io.emit('foodsDropped', droppedFoods);
    
    player.snake = [];
    player.score = 0;
    player.width = 15;
}

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    players[socket.id] = {
        snake: [],
        score: 0,
        speed: baseSpeed,
        width: 15,
        color: "#2ecc71" // 預設顏色
    };

    socket.emit('initFoods', foods);

    socket.on('updatePos', (data) => {
        if (!players[socket.id] || !data.snake || data.snake.length === 0) return;
        const player = players[socket.id];
        player.snake = data.snake;
        
        // 接收玩家選定的皮膚顏色
        if (data.color) player.color = data.color;

        // 加速扣分邏輯 (每次更新扣 1 分，保持平滑)
        if (data.isBoosting && player.snake.length > 20 && player.score > 0) {
            player.score = Math.max(0, player.score - 1); 
            player.width = Math.max(15, 15 + (player.score / 30));
            io.emit('scoreUpdate', { id: socket.id, score: player.score, width: player.width });
        }
        
        let head = player.snake[0];
        if (!head) return;

        // 1. 食物判定
        for (let id in foods) {
            let f = foods[id];
            let distToFood = Math.sqrt(Math.pow(head.x - f.x, 2) + Math.pow(head.y - f.y, 2));
            
            if (distToFood < (player.width / 2 + f.size)) { 
                player.score += f.pts;
                player.width = 15 + (player.score / 30); 
                
                delete foods[id];
                let newFood = spawnSingleFood(); 
                
                io.emit('foodEaten', { eatenId: id, newFood: newFood });
                io.emit('scoreUpdate', { id: socket.id, score: player.score, width: player.width });
                break; 
            }
        }

        // 2. 邊界死亡判定!!!!!
        let distToCenter = Math.sqrt(Math.pow(head.x - WORLD_CENTER.x, 2) + Math.pow(head.y - WORLD_CENTER.y, 2));
        if (distToCenter > WORLD_RADIUS) {
            handlePlayerDeath(socket.id);
            socket.emit('die');
            return;
        }

        // 3. 碰撞死亡判定
        for (let otherId in players) {
            if (otherId === socket.id) continue;
            let otherPlayer = players[otherId];
            if (!otherPlayer.snake || otherPlayer.snake.length === 0) continue;

            for (let segment of otherPlayer.snake) {
                let distToEnemy = Math.sqrt(Math.pow(head.x - segment.x, 2) + Math.pow(head.y - segment.y, 2));
                if (distToEnemy < (otherPlayer.width / 2 + 2)) {
                    handlePlayerDeath(socket.id); 
                    socket.emit('die');
                    return; 
                }
            }
        }

        // 廣播給其他玩家 (包含粗度與顏色)
        socket.broadcast.emit('enemyUpdate', {
            id: socket.id,
            snake: player.snake,
            width: player.width,
            color: player.color
        });
    });

    socket.on('disconnect', () => {
        handlePlayerDeath(socket.id); 
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        console.log('玩家離開:', socket.id);
    });
});

const PORT = process.env.PORT || 3000; 
http.listen(PORT, () => {
    console.log(`伺服器運行中，埠號：${PORT}`);
});
