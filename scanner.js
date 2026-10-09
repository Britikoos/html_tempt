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

// Ловим все ошибки на странице
window.addEventListener("error", (e) => {
    log("❌ JS Error: " + e.message);
});

async function initDetector() {
    log("Проверяю BarcodeDetector...");

    // Если полифил загрузился, но не зарегистрировался автоматически — ставим вручную
    if (!("BarcodeDetector" in window)) {
        if (window.BarcodeDetectorPolyfill) {
            window.BarcodeDetector = window.BarcodeDetectorPolyfill;
            log("Полифил установлен вручную");
        } else if (window.barcodeDetectorPolyfill) {
            window.BarcodeDetector = window.barcodeDetectorPolyfill.BarcodeDetectorPolyfill;
            log("Полифил установлен вручную (вариант 2)");
        }
    }

    // Ждём до 5 секунд, пока полифил догрузится
    for (let i = 0; i < 10; i++) {
        if ("BarcodeDetector" in window) break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (!("BarcodeDetector" in window)) {
        log("❌ BarcodeDetector недоступен. Проверь подключение скрипта.");
        return false;
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
    log("Запрашиваю камеру...");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        log("❌ getUserMedia недоступен. Нужен HTTPS.");
        return;
    }

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
        // тихо игнорируем кадры без штрихкода
    }
}

async function handleScan(code) {
    log(`🔍 Ищу: ${code}...`);

    try {
        const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                "_auth": tg.initData,
                "barcode": code
            })
        });
        const data = await res.json();

        if (data.ok && data.results.length > 0) {
            const list = data.results
                .map(r => `<a href="${r.link}" target="_blank">📄 Пост от ${r.date.slice(0, 10)}</a>`)
                .join("<br>");
            resultEl.innerHTML = `<b>✅ Найдено ${data.results.length}:</b><br>${list}`;
            tg.HapticFeedback.notificationOccurred("success");
        } else {
            log(`❌ По штрихкоду ${code} ничего не найдено`);
            tg.HapticFeedback.notificationOccurred("error");
        }
    } catch (err) {
        log("Ошибка API: " + err.message);
    }
}

// Запуск
(async () => {
    const ok = await initDetector();
    if (ok) await startCamera();
})();
