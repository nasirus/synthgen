from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Event(Base):
    __tablename__ = 'events'
    
    message_id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    payload = Column(Text, nullable=False) 
    result = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)    
    updated_at = Column(DateTime, nullable=False)
    duration = Column(Integer, nullable=True)
