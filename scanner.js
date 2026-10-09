const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
const scanBtn = document.getElementById("scanBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");

let busy = false;

function log(msg) {
    console.log(msg);
    if (resultEl) resultEl.innerHTML = msg;
}

scanBtn.addEventListener("click", () => {
    if (busy) return;
    log("Открываю камеру...");
    fileInput.click();
});

fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) {
        log("Файл не выбран");
        return;
    }

    busy = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "⏳ Обрабатываю...";

    try {
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
    } catch (err) {
        log("Ошибка превью: " + err.message);
    }

    log("📤 Отправляю фото на сервер...");

    try {
        const formData = new FormData();
        formData.append("_auth", tg.initData || "");
        formData.append("photo", file, "scan.jpg");

        const res = await fetch("/api/scan-photo", {
            method: "POST",
            body: formData
        });

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            log(`❌ Сервер вернул не JSON (HTTP ${res.status}):<br>${text.slice(0, 300)}`);
            return;
        }

        if (data.ok && data.results.length > 0) {
            const list = data.results
                .map(r => `<a href="${r.link}" target="_blank">📄 Пост от ${r.date.slice(0, 10)}</a>`)
                .join("<br>");
            log(`<b>✅ Штрихкод: ${data.barcode}</b><br>Найдено ${data.results.length}:<br>${list}`);
            tg.HapticFeedback.notificationOccurred("success");
        } else if (data.ok) {
            log(`❌ Штрихкод <b>${data.barcode}</b> распознан, но в базе не найден`);
            tg.HapticFeedback.notificationOccurred("error");
        } else {
            log(`❌ ${data.error || "Не удалось распознать штрихкод"}`);
            tg.HapticFeedback.notificationOccurred("error");
        }
    } catch (err) {
        log("Ошибка запроса: " + err.message);
    } finally {
        busy = false;
        scanBtn.disabled = false;
        scanBtn.textContent = "📸 Сделать фото штрихкода";
        fileInput.value = "";
    }
});
