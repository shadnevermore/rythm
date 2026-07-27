FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY mini-web/ .

EXPOSE 80
