from dotenv import load_dotenv
load_dotenv()

from mailer import send_mail

send_mail(
    ["2026aim1020@iitrpr.ac.in"],  # change to an inbox you can check
    "Guest House portal: test mail",
    "If you can read this, SMTP is working.\n\nThis is an automated message. Please do not reply.",
)
print("done - check the inbox (and spam)")