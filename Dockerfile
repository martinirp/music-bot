FROM node:18

RUN apt-get update
RUN apt-get install -y ffmpeg

WORKDIR /app

COPY . .

RUN npm install
CMD [ "npm", "run", "start" ]
