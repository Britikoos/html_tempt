const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
const video = document.getElementById("video");
let busy = false;
let detector = null;
let scanInterval = null;

// Проверяем поддержку BarcodeDetector
const hasNativeDetector = "BarcodeDetector" in window;

async function initDetector() {
    // Если браузер не поддерживает — используем полифил
    if (!hasNativeDetector) {
        // Полифил подключается в index.html через <script>
        // После его загрузки BarcodeDetector становится доступен глобально
        await window.BarcodeDetectorPolyfill?.ready;
    }
    
    detector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]
    });
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",  // задняя камера
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;
        await video.play();
        
        // Запускаем цикл сканирования
        scanInterval = setInterval(scanFrame, 300);  // каждые 300 мс
        resultEl.textContent = "Наведите камеру на штрихкод...";
    } catch (err) {
        resultEl.textContent = "❌ Нет доступа к камере: " + err.message;
    }
}

async function scanFrame() {
    if (busy || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            await handleScan(code);
        }
    } catch (err) {
        // Игнорируем ошибки кадров без штрихкода
    }
}

async function handleScan(decodedText) {
    busy = true;
    resultEl.innerHTML = `🔍 Ищу: <b>${decodedText}</b>...`;
    tg.HapticFeedback.impactOccurred("light");

    try {
        const response = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                "_auth": tg.initData,
                "barcode": decodedText
            })
        });
        const data = await response.json();

        if (data.ok && data.results.length > 0) {
            const list = data.results
                .map(r => `<a href="${r.link}" target="_blank">📄 Пост от ${r.date.slice(0, 10)}</a>`)
                .join("<br>");
            resultEl.innerHTML = `<b>✅ Найдено ${data.results.length}:</b><br>${list}`;
            tg.HapticFeedback.notificationOccurred("success");
        } else {
            resultEl.innerHTML = `❌ По штрихкоду <b>${decodedText}</b> ничего не найдено`;
            tg.HapticFeedback.notificationOccurred("error");
        }
    } catch (err) {
        resultEl.innerText = "Ошибка запроса: " + err.message;
    }

    // Разблокировка через 2 секунды
    setTimeout(() => { busy = false; }, 2000);
}

// Инициализация
(async () => {
    await initDetector();
    await startCamera();
})();
