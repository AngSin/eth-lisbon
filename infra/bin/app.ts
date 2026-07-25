#!/usr/bin/env node
import "source-map-support/register.js";
import { App } from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.js";
import { loadDeploymentConfig } from "../lib/config.js";
import { DnsStack } from "../lib/dns-stack.js";
import { FrontendStack } from "../lib/frontend-stack.js";
import { LandingStack } from "../lib/landing-stack.js";

const app = new App();
const config = loadDeploymentConfig(app);

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1";

const dnsStack = new DnsStack(app, "NomadTestnetDnsStack", {
  env: { account, region: "us-east-1" },
  config,
  crossRegionReferences: true,
});

new ApiStack(app, "NomadTestnetApiStack", {
  env: { account, region },
  config,
  hostedZone: dnsStack.hostedZone,
});

new FrontendStack(app, "NomadTestnetFrontendStack", {
  env: { account, region },
  config,
  hostedZone: dnsStack.hostedZone,
  certificate: dnsStack.frontendCertificate,
  crossRegionReferences: true,
});

new LandingStack(app, "NomadLandingStack", {
  env: { account, region },
  config,
});
