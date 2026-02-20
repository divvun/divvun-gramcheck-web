# Use Node.js 22 LTS
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install global dependencies
RUN npm install -g @google/clasp@3.2.0

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Default command
CMD ["bash"]