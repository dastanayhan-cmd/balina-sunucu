const WebSocket = require('ws');

// Senin frontend sitenle konuşacak olan sunucu
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

console.log("🚀 Algoritmik Terminal Başlatıldı. Binance dinleniyor...");

// Hafıza: Aktif balina duvarlarını burada tutacağız
const walls = new Map(); 
let wallIdCounter = 1;

// Binance'a TEK bağlantı üzerinden ÇİFT kanal açıyoruz (Emir Defteri + Anlık İşlemler)
const binanceWs = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@depth@100ms/btcusdt@aggTrade');

binanceWs.on('message', (data) => {
    const payload = JSON.parse(data);
    if (!payload.data) return;

    const stream = payload.stream;
    const streamData = payload.data;

    // KANAL 1: EMİR DEFTERİ (Duvar Tespit & Spoofing)
    if (stream === 'btcusdt@depth@100ms') {
        const bids = streamData.b; // Alım Emirleri
        if (!bids) return;

        let maxMagnetVal = 0;
        let magnetPrice = 0;

        bids.forEach(bid => {
            const price = parseFloat(bid[0]);
            const qty = parseFloat(bid[1]);
            const val = price * qty;

            // 🧲 Mıknatıs (Magnet) Tespiti
            if (val > maxMagnetVal) {
                maxMagnetVal = val;
                magnetPrice = price;
            }

            // 🐋 Balina Duvarı Eklendi (500k$ Üzeri)
            if (val >= 500000) {
                if (!walls.has(price)) {
                    const id = wallIdCounter++;
                    walls.set(price, { id, initialVal: val, currentVal: val, isSpoofed: false });
                    broadcast({ type: 'NEW_WALL', id, price, val, coin: 'BTC' });
                } else {
                    const wall = walls.get(price);
                    if (!wall.isSpoofed && val > wall.initialVal) {
                        wall.initialVal = val;
                        wall.currentVal = val;
                        broadcast({ type: 'ARMOR', id: wall.id, health: 100 }); 
                    }
                }
            } 
            // 👻 Spoof (Sahte Emir) Tespiti
            else if (val < 100000 && walls.has(price)) {
                const wall = walls.get(price);
                if (!wall.isSpoofed && (wall.currentVal / wall.initialVal) > 0.5) {
                    wall.isSpoofed = true;
                    broadcast({ type: 'SPOOFED', id: wall.id });
                    setTimeout(() => walls.delete(price), 15000); 
                }
            }
        });

        if (maxMagnetVal > 2000000 && Math.random() < 0.1) {
            broadcast({ type: 'MAGNET', price: magnetPrice, pool: maxMagnetVal });
        }
    } 
    
    // KANAL 2: GERÇEKLEŞEN İŞLEMLER (Kıyma Makinesi / Zırh Erimesi)
    else if (stream === 'btcusdt@aggTrade') {
        const isSell = streamData.m; 
        
        if (isSell) {
            const price = parseFloat(streamData.p);
            const qty = parseFloat(streamData.q);
            const tradeVal = price * qty;

            if (walls.has(price)) {
                const wall = walls.get(price);
                if (!wall.isSpoofed) {
                    wall.currentVal -= tradeVal; 
                    
                    let health = (wall.currentVal / wall.initialVal) * 100;
                    if (health < 0) health = 0;
                    
                    broadcast({ type: 'ARMOR', id: wall.id, health });

                    if (health <= 2) {
                        walls.delete(price);
                    }
                }
            }
        }
    }
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(str);
        }
    });
}
    }
});
