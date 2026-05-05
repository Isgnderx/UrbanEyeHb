import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings
from app.interfaces import IEmailService


class EmailService(IEmailService):
    def __init__(self):
        self.smtp_server = settings.smtp_server or 'smtp.gmail.com'
        self.smtp_port = settings.smtp_port or 587
        self.username = settings.smtp_username
        self.password = settings.smtp_password

    async def send_email(self, to_email: str, subject: str, body: str) -> bool:
        try:
            msg = MIMEMultipart()
            msg['From'] = self.username
            msg['To'] = to_email
            msg['Subject'] = subject

            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.username, self.password)
            text = msg.as_string()
            server.sendmail(self.username, to_email, text)
            server.quit()
            return True
        except Exception as e:
            print(f"Email send failed: {e}")
            return False


email_service = EmailService()
