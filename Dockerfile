FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
