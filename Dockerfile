# Use Apify's base image with Playwright and Chrome pre-installed
FROM apify/actor-node-playwright-chrome:20

# Copy all files from the project
COPY . ./

# Install Node.js dependencies
RUN npm install --include=optional

# Run the actor
CMD [ "npm", "start" ]
