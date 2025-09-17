# Use Node.js 10 to match current requirements
FROM node:10-slim

# Set working directory
WORKDIR /app

# Install global dependencies (exact version to match package.json)
RUN npm install -g @google/clasp@2.3.0

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Default command
CMD ["bash"]