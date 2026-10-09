const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
const video = document.getElementById("video");

// Ловим ВСЕ ошибки на странице
window.addEventListener('error', (e) => {
    resultEl.textContent = '❌ JS Error: ' + e.message;
});

let busy = false;
let detector = null;

function log(msg) {
    console.log(msg);
    resultEl.textContent = msg;
}

async function initDetector() {
    log("Проверяю BarcodeDetector...");
    
    if (!("BarcodeDetector" in window)) {
        log("BarcodeDetector не найден, жду полифил...");
        await new Promise(r => setTimeout(r, 2000));
        if (!("BarcodeDetector" in window)) {
            log("❌ BarcodeDetector так и не появился. Полифил не загрузился.");
            return false;
        }
    }
    
    try {
        detector = new BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]
        });
        log("✅ Детектор создан");
        return true;
    } catch (e) {
        log("❌ Ошибка детектора: " + e.message);
        return false;
    }
}

async function startCamera() {
    log("Проверяю доступ к камере...");
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        log("❌ getUserMedia недоступен. Нужен HTTPS.");
        return;
    }
    
    try {
        log("Запрашиваю камеру...");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        log("✅ Камера получена");
        
        video.srcObject = stream;
        await video.play();
        log("✅ Видео играет. Наведите на штрихкод...");
        
        setInterval(scanFrame, 300);
    } catch (err) {
        log("❌ Камера: " + err.name + " — " + err.message);
    }
}

async function scanFrame() {
    if (busy || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
            busy = true;
            log("🎯 Найден: " + barcodes[0].rawValue);
            setTimeout(() => { busy = false; }, 2000);
        }
    } catch (e) {}
}

(async () => {
    const ok = await initDetector();
    if (ok) await startCamera();
})();
