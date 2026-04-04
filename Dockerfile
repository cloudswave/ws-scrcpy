FROM node:20
MAINTAINER ethanzhu

ENV LANG C.UTF-8
WORKDIR /ws-scrcpy

RUN apt-get update \
 && apt-get install -y android-tools-adb python3 make g++ libx11-dev libxext-dev libxkbfile-dev libxi-dev \
 && rm -rf /var/lib/apt/lists/*

#RUN git clone https://github.com/cloudswave/ws-scrcpy.git .
COPY . .
RUN npm install
RUN npm rebuild node-pty
RUN npm run dist

EXPOSE 8000

CMD ["node","dist/index.js"]