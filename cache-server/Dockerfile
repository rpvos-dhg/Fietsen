# De server importeert de gedeelde query-module uit docs/shared, dus de build
# gebeurt vanuit de projectwortel:  docker build -f cache-server/Dockerfile .
FROM node:22-alpine

WORKDIR /app

COPY cache-server/package.json cache-server/
RUN cd cache-server && npm install --omit=dev

COPY docs/shared/ docs/shared/
COPY cache-server/index.js cache-server/

# Gebruik een gekoppeld volume, anders is de cache bij elke herstart weg en is
# de server nutteloos: juist het bewaren is zijn hele bestaansreden.
ENV CACHE_DIR=/data
VOLUME /data
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/cache-server
CMD ["node", "index.js"]
