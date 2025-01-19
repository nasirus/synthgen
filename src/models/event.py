from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Event(Base):
    __tablename__ = 'events'
    
    message_id = Column(String, primary_key=True)
    timestamp = Column(DateTime, nullable=False)
    status = Column(String, nullable=False)
    payload = Column(Text, nullable=False) 