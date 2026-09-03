FROM python:3.10-slim

WORKDIR /app

# Instalar librerías de sistema requeridas por OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]