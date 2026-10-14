import logging
import os
from logging.handlers import RotatingFileHandler

# ===============================
# SHARED LOGGER FACTORY
# ===============================

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s]: %(message)s"


def setup_logger(name: str, filename: str = None, level=logging.INFO):
    """
    Create or return a reusable logger.
    - name: logger name (module name)
    - filename: log file path (optional)
    """

    logger = logging.getLogger(name)

    # 🔒 prevent duplicate handlers
    if logger.handlers:
        return logger

    logger.setLevel(level)

    formatter = logging.Formatter(LOG_FORMAT)

    # -------- Console handler --------
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # -------- File handler (optional) --------
    if filename:
        file_handler = RotatingFileHandler(
            filename,
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=5,
            encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    logger.propagate = False
    return logger


# 🔁 backward compatibility (important!)
# so old imports don't crash
get_logger = setup_logger
