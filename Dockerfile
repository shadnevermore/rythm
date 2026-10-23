FROM node:22-alpine

WORKDIR /app

COPY server.js index.html app.js styles.css ./

ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "server.js"]
