from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Event(Base):
    __tablename__ = 'events'
    
    message_id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    payload = Column(String, nullable=False)
    result = Column(String, nullable=True)
    
    # Date fields with default values and consistent naming
    created_at = Column(DateTime, nullable=False, default=datetime.today())
    updated_at = Column(DateTime, nullable=False, default=datetime.today(), onupdate=datetime.today())
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True)  # Duration in seconds
