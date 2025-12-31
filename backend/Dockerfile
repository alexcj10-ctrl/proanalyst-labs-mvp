FROM python:3.11-slim

WORKDIR /app

# deps del sistema (mínimo)
RUN pip install --no-cache-dir --upgrade pip

# instala dependencias python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copia el código
COPY . /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
