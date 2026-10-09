const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
const video = document.getElementById("video");
let busy = false;
let detector = null;

function log(msg) {
    console.log(msg);
    resultEl.textContent = msg;
}

async function initDetector() {
    // Ждём загрузки полифила (он подключается в index.html)
    if (!("BarcodeDetector" in window)) {
        log("Полифил не загружен. Ждём...");
        await new Promise(r => setTimeout(r, 2000));
        if (!("BarcodeDetector" in window)) {
            log("❌ BarcodeDetector недоступен. Проверь подключение скрипта.");
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
        log("❌ Ошибка создания детектора: " + e.message);
        return false;
    }
}

async function startCamera() {
    log("Запрашиваю камеру...");
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        video.srcObject = stream;
        await video.play();
        log("✅ Камера запущена. Наведите на штрихкод...");
        
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
            await handleScan(barcodes[0].rawValue);
            setTimeout(() => { busy = false; }, 2000);
        }
    } catch (e) {
        // тихо игнорируем
    }
}

async function handleScan(code) {
    log(`🔍 Ищу: ${code}...`);
    try {
        const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ "_auth": tg.initData, "barcode": code })
        });
        const data = await res.json();
        if (data.ok && data.results.length > 0) {
            resultEl.innerHTML = `✅ Найдено: <a href="${data.results[0].link}">${data.results[0].link}</a>`;
        } else {
            log(`❌ Ничего не найдено: ${code}`);
        }
    } catch (e) {
        log("Ошибка API: " + e.message);
    }
}

(async () => {
    const ok = await initDetector();
    if (ok) await startCamera();
})();
