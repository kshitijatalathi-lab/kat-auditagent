# Simple dev Dockerfile for the MCP hybrid backend
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
ENV HOST=0.0.0.0
ENV PORT=8010
EXPOSE 8010

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
