import os
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).parent.parent
LOG_DIR = APP_DIR / ".tmp"
LOG_PATH = LOG_DIR / "logs.txt"


class _LoggerState:
    file: Path | None = None


_logger = _LoggerState()


def _init_logger() -> None:
    if os.environ.get("NODE_ENV") != "development":
        return

    try:
        LOG_DIR.mkdir(exist_ok=True)
        _logger.file = LOG_PATH

        with _logger.file.open("w") as f:
            f.write(f"=== Engine started at {datetime.now().isoformat()} ===\n")
    except Exception:
        pass


def log(message: str, context: str = "general") -> None:
    """Log a message to .tmp/logs.txt if NODE_ENV is development."""

    if _logger.file is None:
        return

    timestamp = datetime.now().isoformat(timespec="milliseconds")
    line = f"[{timestamp}] [{context}] {message}\n"

    try:
        with _logger.file.open("a") as f:
            f.write(line)
            f.flush()
    except Exception:
        pass


_init_logger()
