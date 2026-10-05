FROM mcr.microsoft.com/powershell:7.5-ubuntu-22.04

WORKDIR /app
COPY . .

ENV FOMO_LISTEN_HOST=*
ENV FOMO_VOTES_FILE=/tmp/fomo-votes.json

EXPOSE 10000

CMD ["pwsh", "-NoLogo", "-NoProfile", "-File", "/app/server.ps1"]
