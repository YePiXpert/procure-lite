FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OFFICE_SUPPLIES_DATA_DIR=/app/state/data \
    OFFICE_AUTH_COOKIE_SECURE=auto

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

RUN mkdir -p /app/state/data /app/state/uploads /app/state/logs

VOLUME ["/app/state"]

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
