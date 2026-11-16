import hmac
import hashlib
import json
import io
import os
import uuid
import base64
from urllib.parse import parse_qsl
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

from aiogram import Bot
from aiogram.types import BufferedInputFile

from config import settings

settings.validate()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

EXPORTS_DIR = Path("exports")
EXPORTS_DIR.mkdir(exist_ok=True)

bot = Bot(settings.BOT_TOKEN)

# ---------- Шрифты ----------
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]

def load_font(size: int, bold: bool = False):
    for path in FONT_PATHS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


@app.get("/")
async def root():
    return FileResponse("static/index.html")


def validate_init_data(init_data: str) -> dict:
    try:
        pairs = parse_qsl(init_data)
        data = dict(pairs)
        received_hash = data.pop("hash", None)
        if not received_hash:
            raise ValueError("No hash")
        check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
        if calculated_hash != received_hash:
            raise ValueError("Invalid signature")
        return json.loads(data.get("user", "{}"))
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


class GradePayload(BaseModel):
    person_id: int
    quality: str
    score: int
    initData: str


@app.post("/api/grade")
async def save_grade(payload: GradePayload):
    user = validate_init_data(payload.initData)
    print(f"User {user['id']} rated person {payload.person_id} on {payload.quality}: {payload.score}")
    return {"ok": True}


# ---------- Экспорт ----------
class ExportRow(BaseModel):
    rank: int
    name: str
    score: float


class ExportPayload(BaseModel):
    rows: list[ExportRow]
    initData: str


def make_initials_avatar(name: str, size: int = 96) -> Image.Image:
    """Рисует круг с первой буквой имени."""
    img = Image.new("RGB", (size, size), (200, 200, 200))
    draw = ImageDraw.Draw(img)
    letter = (name.strip()[0] if name.strip() else "?").upper()
    font = load_font(int(size * 0.5), bold=True)
    bbox = draw.textbbox((0, 0), letter, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), letter, font=font, fill=(255, 255, 255))
    # Круглая маска
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def render_rating_image(rows: list[ExportRow]) -> bytes:
    width = 900
    row_h = 130
    top_padding = 160
    bottom_padding = 40
    height = top_padding + row_h * len(rows) + bottom_padding

    # Градиентный фон
    bg = Image.new("RGB", (width, height), (255, 255, 255))
    draw_bg = ImageDraw.Draw(bg)
    for y in range(height):
        t = y / height
        r = int(245 - 20 * t)
        g = int(248 - 25 * t)
        b = int(255 - 15 * t)
        draw_bg.line([(0, y), (width, y)], fill=(r, g, b))

    draw = ImageDraw.Draw(bg)

    title_font = load_font(44, bold=True)
    name_font = load_font(30, bold=True)
    score_font = load_font(32, bold=True)
    rank_font = load_font(36, bold=True)

    title = "Рейтинг кандидатов"
    title_w = draw.textlength(title, font=title_font)
    draw.text(((width - title_w) / 2, 40), title, font=title_font, fill=(30, 30, 50))

    for i, row in enumerate(rows):
        y = top_padding + i * row_h
        card_x0, card_y0 = 30, y
        card_x1, card_y1 = width - 30, y + row_h - 20
        draw.rounded_rectangle(
            (card_x0, card_y0, card_x1, card_y1),
            radius=24,
            fill=(255, 255, 255),
            outline=(230, 230, 240),
            width=2,
        )

        # Место — цифрой
        rank_text = str(row.rank)
        rank_w = draw.textlength(rank_text, font=rank_font)
        draw.text((card_x0 + 40 - rank_w / 2, card_y0 + 38), rank_text, font=rank_font, fill=(120, 120, 150))

        # Аватар — круг с первой буквой
        avatar = make_initials_avatar(row.name, 96)
        bg.paste(avatar, (card_x0 + 110, card_y0 + 17), avatar)

        # Имя
        draw.text((card_x0 + 230, card_y0 + 38), row.name, font=name_font, fill=(30, 30, 50))

        # Балл (красный, если отрицательный)
        score_text = f"{row.score:.2f}"
        color = (51, 144, 236) if row.score >= 0 else (231, 76, 60)
        s_w = draw.textlength(score_text, font=score_font)
        draw.text((card_x1 - s_w - 30, card_y0 + 40), score_text, font=score_font, fill=color)

    buf = io.BytesIO()
    bg.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@app.post("/api/export")
async def export_rating(payload: ExportPayload):
    user = validate_init_data(payload.initData)
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="No user id in initData")

    if not payload.rows:
        raise HTTPException(status_code=400, detail="Empty rows")

    img_bytes = render_rating_image(payload.rows)

    filename = f"rating_{user_id}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = EXPORTS_DIR / filename
    filepath.write_bytes(img_bytes)

    try:
        await bot.send_photo(
            chat_id=user_id,
            photo=BufferedInputFile(img_bytes, filename="rating.jpg"),
            caption="Рейтинг готов! Перешли фото или сохрани в галерею.",
        )
    except Exception as e:
        print("send_photo error:", e)
        raise HTTPException(status_code=500, detail=f"Не удалось отправить фото: {e}")

    return {"ok": True, "file": filename}