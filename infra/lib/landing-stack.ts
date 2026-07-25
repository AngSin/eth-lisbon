import path from "node:path";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./config.js";

export interface LandingStackProps extends StackProps {
  config: DeploymentConfig;
}

export class LandingStack extends Stack {
  constructor(scope: Construct, id: string, props: LandingStackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, "LandingAssetsBucket", props.config.landingAssetsBucketName);
    const distribution = cloudfront.Distribution.fromDistributionAttributes(this, "LandingDistribution", {
      distributionId: props.config.landingDistributionId,
      domainName: props.config.landingDistributionDomainName,
    });

    new s3deploy.BucketDeployment(this, "LandingDeployment", {
      sources: [s3deploy.Source.asset(path.join("..", "landing", "dist"))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "LandingUrl", {
      value: `https://${props.config.landingDomainName}`,
    });
  }
}
