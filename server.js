const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

console.log("🚀 Multi-Coin Terminal Başlatıldı. BTC, ETH, SOL dinleniyor...");

const walls = new Map();
let wallIdCounter = 1;

// Binance'a TEK bağlantı üzerinden 6 kanal (3 Coin x 2 Veri) açıyoruz
const streams = 'btcusdt@depth@100ms/btcusdt@aggTrade/ethusdt@depth@100ms/ethusdt@aggTrade/solusdt@depth@100ms/solusdt@aggTrade';
const binanceWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

binanceWs.on('message', (data) => {
    const payload = JSON.parse(data);
    if (!payload.data) return;

    const stream = payload.stream;
    const streamData = payload.data;
    const coin = stream.split('usdt')[0].toUpperCase(); // 'btcusdt...' -> 'BTC'

    if (stream.includes('@depth')) {
        const bids = streamData.b;
        if (!bids) return;

        let maxMagnetVal = 0, magnetPrice = 0;

        bids.forEach(bid => {
            const price = parseFloat(bid[0]);
            const val = price * parseFloat(bid[1]);

            if (val > maxMagnetVal) { maxMagnetVal = val; magnetPrice = price; }

            // Coinlere Özel Balina Barajları (Hacim farkından dolayı)
            let wallThreshold = coin === 'BTC' ? 500000 : (coin === 'ETH' ? 250000 : 100000);
            const wallKey = `${coin}-${price}`;

            if (val >= wallThreshold) {
                if (!walls.has(wallKey)) {
                    const id = wallIdCounter++;
                    walls.set(wallKey, { id, initialVal: val, currentVal: val, isSpoofed: false, coin });
                    broadcast({ type: 'NEW_WALL', id, price, val, coin });
                } else {
                    const wall = walls.get(wallKey);
                    if (!wall.isSpoofed && val > wall.initialVal) {
                        wall.initialVal = wall.currentVal = val;
                        broadcast({ type: 'ARMOR', id: wall.id, health: 100 }); 
                    }
                }
            } 
            else if (val < (wallThreshold / 5) && walls.has(wallKey)) {
                const wall = walls.get(wallKey);
                if (!wall.isSpoofed && (wall.currentVal / wall.initialVal) > 0.5) {
                    wall.isSpoofed = true;
                    broadcast({ type: 'SPOOFED', id: wall.id });
                    setTimeout(() => walls.delete(wallKey), 15000); 
                }
            }
        });

        let magThreshold = coin === 'BTC' ? 2000000 : (coin === 'ETH' ? 1000000 : 300000);
        if (maxMagnetVal > magThreshold && Math.random() < 0.1) {
            broadcast({ type: 'MAGNET', price: magnetPrice, pool: maxMagnetVal, coin });
        }
    } 
    else if (stream.includes('@aggTrade')) {
        if (streamData.m) {
            const price = parseFloat(streamData.p);
            const tradeVal = price * parseFloat(streamData.q);
            const wallKey = `${coin}-${price}`;

            if (walls.has(wallKey)) {
                const wall = walls.get(wallKey);
                if (!wall.isSpoofed) {
                    wall.currentVal -= tradeVal; 
                    let health = (wall.currentVal / wall.initialVal) * 100;
                    if (health < 0) health = 0;
                    broadcast({ type: 'ARMOR', id: wall.id, health });
                    if (health <= 2) walls.delete(wallKey);
                }
            }
        }
    }
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(str);
    });
                     }
