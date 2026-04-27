"""
SteadyAlpha Abstract Broker Adapter
Phase 4: Broker Hardening
"""
from abc import ABC, abstractmethod
from typing import Dict, Any

class BrokerAdapter(ABC):
    @abstractmethod
    def connect(self) -> bool:
        pass
        
    @abstractmethod
    def place_order(self, symbol: str, direction: str, qty: int, price: float = 0.0) -> Dict[str, Any]:
        """Place live order and return order details."""
        pass
        
    @abstractmethod
    def get_positions(self) -> Dict[str, Any]:
        """Fetch current open positions."""
        pass
        
    @abstractmethod
    def get_account_balance(self) -> float:
        """Fetch real-time account equity."""
        pass
