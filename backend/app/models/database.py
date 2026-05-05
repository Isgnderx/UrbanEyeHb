from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class ContactMessage(Base):
    __tablename__ = 'contact_messages'

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)


class UrbanReport(Base):
    __tablename__ = 'urban_reports'

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    notes = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    photo_path = Column(String(500), nullable=True)
    user_id = Column(Integer, nullable=True)  # If needed for user association


class ReportUploadRequest(Base):
    __tablename__ = 'report_upload_requests'

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    notes = Column(Text, nullable=False)
    photo_path = Column(String(500), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
