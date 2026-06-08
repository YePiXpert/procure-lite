FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PROCURE_LITE_STATE_DIR=/app/state \
    PROCURE_LITE_AUTH_COOKIE_SECURE=auto

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

COPY VERSION /app/VERSION
COPY alembic.ini /app/alembic.ini
COPY *.py /app/
COPY alembic /app/alembic
COPY db /app/db
COPY parser /app/parser
COPY routers /app/routers
COPY static /app/static

RUN mkdir -p /app/state/data /app/state/uploads /app/state/logs

VOLUME ["/app/state"]

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
