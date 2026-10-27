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


def _send_via_gmail(recipients, subject, body, attachment) -> None:
    """Send as GMAIL_SENDER through the Gmail API. Needs domain-wide delegation approved by the Workspace admin."""
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = GMAIL_SENDER, ", ".join(recipients), subject
    msg.set_content(body)
    if attachment:
        name, data, mime = attachment
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype or "octet-stream", filename=name)
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        creds = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=["https://www.googleapis.com/auth/gmail.send"], subject=GMAIL_SENDER)
        svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    except Exception as exc:  # never raise out of a background task
        print(f"WARNING: could not send mail via Gmail API to {recipients}: {exc!r}")


def send_mail(to: Iterable[str], subject: str, body: str,
              attachment: Optional[Tuple[str, bytes, str]] = None) -> None:
    """attachment = (filename, bytes, mimetype)"""
    recipients = sorted({t.strip().lower() for t in to if t and t.strip()})
    if not recipients:
        return
    if GMAIL_SENDER:
        _send_via_gmail(recipients, subject, body, attachment)
        return
    if not SMTP_HOST:
        print(f"[mail not sent - SMTP_HOST not set] to={recipients} subject={subject!r}\n{body}\n")
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SMTP_FROM, ", ".join(recipients), subject
    msg.set_content(body)
    if attachment:
        name, data, mime = attachment
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype or "octet-stream", filename=name)
    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                if SMTP_USER:
                    s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.starttls()
                if SMTP_USER:
                    s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
    except Exception as exc:  # never raise out of a background task
        print(f"WARNING: could not send mail to {recipients}: {exc!r}")