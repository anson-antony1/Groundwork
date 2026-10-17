# Hosted Groundwork: one container serves the FastAPI backend (unchanged) and the built frontend.
# Render builds it from the repo root (see render.yaml and deploy/README.md).

# --- 1. Build the frontend in live mode -------------------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_HOSTED=1 adds the shared-server notes. Nothing secret goes in VITE_ variables.
RUN VITE_API_MODE=live VITE_HOSTED=1 npm run build

# --- 2. Run the backend and serve the build ---------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GROUNDWORK_REFRESH_WEATHER=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY fixtures/ fixtures/
COPY policies/ policies/
COPY deploy/ deploy/
COPY --from=frontend /app/frontend/dist frontend/dist
EXPOSE 8010
CMD ["sh", "deploy/start.sh"]
