const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const resultEl = document.getElementById("result");
const scanBtn = document.getElementById("scanBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");

// Проверяем, что все элементы найдены
console.log("resultEl:", resultEl);
console.log("scanBtn:", scanBtn);
console.log("fileInput:", fileInput);
console.log("preview:", preview);

if (!resultEl || !scanBtn || !fileInput || !preview) {
    document.body.innerHTML = "<h2>Ошибка: не все элементы найдены в HTML</h2>";
}

let busy = false;

function log(msg) {
    console.log(msg);
    if (resultEl) resultEl.innerHTML = msg;
}

scanBtn?.addEventListener("click", () => {
    if (busy) return;
    log("Кнопка нажата, открываю камеру...");
    try {
        fileInput.click();
    } catch (e) {
        log("Ошибка при клике на input: " + e.message);
    }
});

fileInput?.addEventListener("change", async (e) => {
    log("Файл выбран, начинаю обработку...");

    const file = e.target.files[0];
    if (!file) {
        log("Файл не выбран");
        return;
    }

    log("Файл: " + file.name + ", размер: " + file.size);

    busy = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "⏳ Обрабатываю...";

    try {
        log("Создаю превью...");
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
        log("Превью создано");
    } catch (e) {
        log("Ошибка при создании превью: " + e.message);
        busy = false;
        scanBtn.disabled = false;
        scanBtn.textContent = "📸 Сделать фото штрихкода";
        return;
    }

    try {
        log("Формирую FormData...");

        if (typeof tg.initData !== "string") {
            log("❌ tg.initData не строка: " + typeof tg.initData);
            return;
        }

        const formData = new FormData();
        formData.append("_auth", tg.initData);
        formData.append("photo", file, "scan.jpg");

        log("Отправляю на сервер...");

        const res = await fetch("/api/scan-photo", {
            method: "POST",
            body: formData
        });

        log("Ответ получен, читаю текст...");
        const text = await res.text();

        log("Парсю JSON...");
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
        } else if (data.ok) {
            log(`❌ Штрихкод <b>${data.barcode}</b> распознан, но в базе не найден`);
        } else {
            log(`❌ Не удалось распознать штрихкод.`);
        }
    } catch (err) {
        log("❌ Ошибка запроса: " + err.message);
    } finally {
        busy = false;
        scanBtn.disabled = false;
        scanBtn.textContent = "📸 Сделать фото штрихкода";
        fileInput.value = "";
    }
});
