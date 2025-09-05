from __future__ import annotations

from abc import ABC, abstractmethod


class BaseAgent(ABC):
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError
