FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# git + sudo are required by Cursor Cloud agents (in-container checkout + privileged
# setup); curl + the python3 toolchain back the rag/ FastAPI service and its venv.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    sudo \
    ca-certificates \
    curl \
    python3 \
    python3-venv \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Cloud agents operate as a non-root `ubuntu` user. The node base image already
# uses UID 1000 (the `node` user), so let useradd auto-assign ubuntu's UID.
RUN id -u ubuntu >/dev/null 2>&1 || useradd --no-log-init -m -s /bin/bash ubuntu \
  && usermod -aG sudo ubuntu \
  && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /workspace
