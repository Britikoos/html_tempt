const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
let busy = false;  // защита от повторного сканирования

const scanner = new Html5QrcodeScanner("reader", {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128
    ]
});

async function onScanSuccess(decodedText) {
    if (busy) return;
    busy = true;
    resultEl.innerHTML = `🔍 Ищу: <b>${decodedText}</b>...`;

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

    // Разблокировка через 2 секунды, чтобы можно было сканировать снова
    setTimeout(() => { busy = false; }, 2000);
}

function onScanError(err) {
    // Молча игнорируем ошибки распознавания (кадры без штрихкода)
}

scanner.render(onScanSuccess, onScanError);