import { Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./config.js";

export interface DnsStackProps extends StackProps {
  config: DeploymentConfig;
}

export class DnsStack extends Stack {
  readonly hostedZone: route53.IHostedZone;
  readonly frontendCertificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: props.config.hostedZoneId,
      zoneName: props.config.hostedZoneName,
    });

    this.frontendCertificate = new acm.Certificate(this, "FrontendCertificate", {
      domainName: props.config.frontendDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }
}
