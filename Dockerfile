FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
COPY ledgerguard ledgerguard
RUN pip install --no-cache-dir .
CMD ["uvicorn", "ledgerguard.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
