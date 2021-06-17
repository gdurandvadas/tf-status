# tf-status

A GitHub App that publish the result of Terraform plans in Pull Requests

## Setup

```sh
# Install dependencies
yarn install

# Run the bot
yarn start
```

## Docker

```sh
# 1. Build container
docker build -t tf-status .

# 2. Start container
docker run \
  -e APP_ID=<app-id> \
  -e PRIVATE_KEY=<pem-value> \
  -e WEBHOOK_SECRET=<webhook-secret> \
  -e GITHUB_CLIENT_ID=<github-client-id> \
  -e GITHUB_CLIENT_SECRET=<github-client-secret> \
  -e TFE_TOKEN=<terraform-cloud-token> \
  tf-status
```
