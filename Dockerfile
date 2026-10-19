FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install production dependencies before source code so dependency changes are
# the only thing that invalidates this layer. The application has no runtime
# native dependencies; Playwright remains a development-only dependency.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/seed ./backend/seed
COPY --chown=node:node fixtures ./fixtures
COPY --chown=node:node backend/fixtures ./backend/fixtures
COPY --chown=node:node frontend ./frontend

ENV NODE_ENV=production \
    COMPASS_HOST=0.0.0.0 \
    COMPASS_PORT=3000 \
    COMPASS_DATA_DIR=/app/data

RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "const http=require('node:http');const r=http.get('http://127.0.0.1:3000/api/control-rooms',x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>{try{const rooms=JSON.parse(b).rooms;process.exit(x.statusCode===200&&Array.isArray(rooms)&&rooms.length>0&&rooms.every(room=>room.health==='READY')?0:1)}catch{process.exit(1)}})});r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"]

CMD ["node", "backend/src/server.mjs"]
