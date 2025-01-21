from sqlalchemy import Column, String, DateTime, Integer, Boolean
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import pytz

Base = declarative_base()


class Event(Base):
    __tablename__ = "events"

    message_id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    payload = Column(String, nullable=False)
    result = Column(String, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    cached = Column(Boolean, nullable=False, default=False)

    # Date fields with timezone support
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(pytz.UTC))
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration = Column(Integer, nullable=True)  # Duration in seconds
