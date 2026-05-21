FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Anwendungscode
COPY server ./server
COPY public ./public

EXPOSE 3000
CMD ["node", "server/server.js"]
