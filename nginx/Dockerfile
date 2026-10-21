FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN mkdir -p /var/log/inventory && chown nginx:nginx /var/log/inventory
COPY default.conf /etc/nginx/conf.d/default.conf
USER nginx
