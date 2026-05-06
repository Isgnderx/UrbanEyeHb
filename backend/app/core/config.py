from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'Urban Copernicus API'
    app_env: str = Field(default='dev', alias='APP_ENV')
    app_debug: bool = Field(default=False, alias='APP_DEBUG')
    app_host: str = Field(default='0.0.0.0', alias='APP_HOST')
    app_port: int = Field(default=8000, alias='PORT')

    frontend_origin: str = Field(default='*', alias='FRONTEND_ORIGIN')

    database_url: str = Field(default='sqlite:///./urbaneye.db', alias='DATABASE_URL')

    smtp_server: str = Field(default='smtp.gmail.com', alias='SMTP_SERVER')
    smtp_port: int = Field(default=587, alias='SMTP_PORT')
    smtp_username: str = Field(default='', alias='SMTP_USERNAME')
    smtp_password: str = Field(default='', alias='SMTP_PASSWORD')

    cdse_client_id: str = Field(default='', alias='CDSE_CLIENT_ID')
    cdse_client_secret: str = Field(default='', alias='CDSE_CLIENT_SECRET')
    cdse_token_url: str = Field(
        default='https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
        alias='CDSE_TOKEN_URL',
    )
    cdse_process_url: str = Field(
        default='https://sh.dataspace.copernicus.eu/process/v1',
        alias='CDSE_PROCESS_URL',
    )


settings = Settings()
