FROM node:20-alpine

WORKDIR /app

# Install build dependencies if needed
COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Ensure uploads and database folders exist
RUN mkdir -p uploads database

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
