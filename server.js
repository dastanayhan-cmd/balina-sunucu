const WebSocket = require('ws');

// 1. Senin sitenle haberleşecek olan kendi WebSocket sunucumuz
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// 2. Binance'a bağlanan hattımız (BTC/USDT Emir Defteri - saniyede 10 kez güncellenir)
const binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@depth@100ms');

console.log("Garson uyandı, Binance mutfağı dinleniyor...");

binanceWs.on('message', (data) => {
    const parsedData = JSON.parse(data);
    
    // Sadece "Alım Emirlerini" (Bids - 'b') kontrol et
    if (parsedData.b) {
        parsedData.b.forEach(bid => {
            const price = parseFloat(bid[0]); // Fiyat
            const quantity = parseFloat(bid[1]); // Miktar (BTC)
            const totalValue = price * quantity;

            // FİLTRE: Eğer tek bir fiyatta 500.000 Dolardan fazla alım emri varsa BALİNA ALARMI ver!
            if (totalValue > 500000) {
                const whaleData = JSON.stringify({
                    coin: "BTC",
                    price: price.toFixed(2),
                    totalValue: totalValue.toFixed(0)
                });

                // Bu alarmı sitendeki (cPanel'deki) ziyaretçilere gönder
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(whaleData);
                    }
                });
            }
        });
    }
});
