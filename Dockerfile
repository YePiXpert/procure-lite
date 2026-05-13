FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OFFICE_SUPPLIES_DATA_DIR=/app/state/data \
    OFFICE_AUTH_COOKIE_SECURE=auto

WORKDIR /app

COPY requirements-server.txt /app/requirements-server.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ARG PIP_INDEX_URL
ARG PIP_EXTRA_INDEX_URL
ARG PIP_TRUSTED_HOST
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120
RUN python -m pip install --no-cache-dir --prefer-binary -r /app/requirements-server.txt

COPY . /app

RUN mkdir -p /app/state/data /app/state/uploads /app/state/logs

VOLUME ["/app/state"]

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
