"""Auth request schemas."""

import re

from pydantic import BaseModel, Field, field_validator

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip().lower()
        if not _USERNAME_RE.match(value):
            raise ValueError("Username may only contain letters, numbers, '.', '_' and '-'.")
        return value
