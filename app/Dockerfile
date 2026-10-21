FROM node:22-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force
COPY server.js ./
COPY public ./public
RUN mkdir -p /var/log/inventory && chown -R node:node /usr/src/app /var/log/inventory
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.js"]
