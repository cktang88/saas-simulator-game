# server.js has no dependencies: copy and run.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js niche-server.js proxy-guard.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
