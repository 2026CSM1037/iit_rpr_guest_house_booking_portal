"""Plain SMTP e-mail sender. Runs as a FastAPI background task, so a mail failure never breaks a booking action.
"""
import base64
import os
import smtplib
from email.message import EmailMessage
from typing import Iterable, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")  # Gmail app passwords are shown in 4-letter groups
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER or "guesthouse-noreply@iitrpr.ac.in"
# Optional: send through the Gmail API as this Workspace mailbox (service account with domain-wide delegation).
GMAIL_SENDER = os.getenv("GMAIL_SENDER", "").strip()
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE") or os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE") or "credentials.json"