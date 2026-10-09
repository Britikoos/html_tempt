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
    resultEl.innerHTML = msg;
}

// Кнопка открывает камеру
scanBtn.addEventListener("click", () => {
    if (busy) return;
    fileInput.click();
});

// Пользователь сделал фото
fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    busy = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "⏳ Обрабатываю...";

    // Показываем превью
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";

    log("📤 Отправляю фото на сервер...");

    try {
        const formData = new FormData();
        formData.append("_auth", tg.initData);
        // Третий аргумент — ASCII-имя. Иначе Safari падает с "string did not match pattern"
        formData.append("photo", file, "scan.jpg");

        const res = await fetch("/api/scan-photo", {
            method: "POST",
            body: formData
        });

        // Читаем как текст, потом парсим — защита от HTML-ошибок сервера
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            log("❌ Сервер вернул не JSON:<br>" + text.slice(0, 300));
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
            log(`❌ Не удалось распознать штрихкод. Попробуйте ещё раз.`);
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
