# ---- dependencies and build (plain Node image) ------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: TeX Live + Node ------------------------------------------
# The app compiles LaTeX itself, so it runs on the official TeX Live image
# (the same one used to build the original Overleaf project).
FROM texlive/texlive:latest
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    LATEX_RUNNER=local \
    BUILD_DIR=/tmp/book-builds
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Read at runtime: database migrations and the LaTeX templates.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/latex ./latex
EXPOSE 3000
CMD ["node", "server.js"]
