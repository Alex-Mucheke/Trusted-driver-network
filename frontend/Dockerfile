# syntax=docker/dockerfile:1

# ---- build the PWA ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional: Google Maps key baked in at build time (VITE_* vars are public in the bundle).
ARG VITE_GOOGLE_MAPS_KEY
ENV VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY
# Who the privacy notice names as the data controller (public text, safe to bake in).
ARG VITE_OPERATOR_NAME
ARG VITE_OPERATOR_ADDRESS
ARG VITE_PRIVACY_EMAIL
ENV VITE_OPERATOR_NAME=$VITE_OPERATOR_NAME \
    VITE_OPERATOR_ADDRESS=$VITE_OPERATOR_ADDRESS \
    VITE_PRIVACY_EMAIL=$VITE_PRIVACY_EMAIL
RUN npm run build

# ---- serve with nginx; /api and /socket.io are proxied to the API ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
