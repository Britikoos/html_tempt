import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
    APP_URL: str = os.getenv("APP_URL", "")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    def validate(self) -> None:
        missing = []
        if not self.BOT_TOKEN:
            missing.append("BOT_TOKEN")
        if not self.APP_URL:
            missing.append("APP_URL")
        if missing:
            raise RuntimeError(
                f"Не заданы обязательные переменные окружения: {', '.join(missing)}. "
                f"Проверь файл .env"
            )
        if not self.APP_URL.startswith("https://"):
            raise RuntimeError(
                "APP_URL должен начинаться с https:// — Telegram не открывает Mini App по HTTP."
            )


settings = Settings()