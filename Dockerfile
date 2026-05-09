FROM node:22-bookworm-slim

WORKDIR /app

# Python + audio dependencies needed by librosa/soundfile conversion scripts.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

# Create a virtual environment the app can use at runtime.
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

# Install JS dependencies first to maximize Docker layer caching.
# Copy .npmrc so Docker uses the same npm settings as your local install.
COPY package*.json .npmrc ./
RUN npm ci --legacy-peer-deps

# Install Python dependencies for analyze/convert scripts.
COPY python/requirements.txt ./python/requirements.txt
RUN pip install --no-cache-dir -r ./python/requirements.txt

# Copy source and generate Prisma client.
COPY . .
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]
