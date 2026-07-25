import path from "node:path";
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { recordNameForZone, type DeploymentConfig } from "./config.js";

export interface ApiStackProps extends StackProps {
  config: DeploymentConfig;
  hostedZone: route53.IHostedZone;
}

export class ApiStack extends Stack {
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const offersTable = new dynamodb.Table(this, "LoanOffersTable", {
      partitionKey: { name: "offerId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    offersTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
    });
    offersTable.addGlobalSecondaryIndex({
      indexName: "lender-index",
      partitionKey: { name: "lender", type: dynamodb.AttributeType.STRING },
    });
    offersTable.addGlobalSecondaryIndex({
      indexName: "riskLevel-index",
      partitionKey: { name: "riskLevel", type: dynamodb.AttributeType.STRING },
    });

    const loansTable = new dynamodb.Table(this, "LoansTable", {
      partitionKey: { name: "loanId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    loansTable.addGlobalSecondaryIndex({
      indexName: "borrower-index",
      partitionKey: { name: "borrower", type: dynamodb.AttributeType.STRING },
    });
    loansTable.addGlobalSecondaryIndex({
      indexName: "lender-index",
      partitionKey: { name: "lender", type: dynamodb.AttributeType.STRING },
    });
    loansTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
    });
    loansTable.addGlobalSecondaryIndex({
      indexName: "maturityBucket-index",
      partitionKey: { name: "maturityBucket", type: dynamodb.AttributeType.STRING },
    });

    const receiptsTable = new dynamodb.Table(this, "WebhookReceiptsTable", {
      partitionKey: { name: "dedupeKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const commonEnvironment = {
      API_VERSION: "2026-07-25",
      SUI_NETWORK: props.config.suiNetwork,
      SUI_RPC_URL: props.config.suiRpcUrl,
      SUI_PACKAGE_ID: props.config.suiPackageId,
      ...(props.config.suiEventPackageId
        ? { SUI_EVENT_PACKAGE_ID: props.config.suiEventPackageId }
        : {}),
      SUI_REGISTRY_OBJECT_ID: props.config.suiRegistryObjectId,
      COLLATERAL_COIN_TYPE: props.config.collateralCoinType,
      PRINCIPAL_COIN_TYPE: props.config.principalCoinType,
      LOAN_OFFERS_TABLE: offersTable.tableName,
      LOANS_TABLE: loansTable.tableName,
      WEBHOOK_RECEIPTS_TABLE: receiptsTable.tableName,
      WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: "300",
      ...(props.config.inodraWebhookSecretsSecretName
        ? { INODRA_WEBHOOK_SECRETS_SECRET_NAME: props.config.inodraWebhookSecretsSecretName }
        : {}),
      ...(props.config.inodraWebhookSecretsParameterName
        ? { INODRA_WEBHOOK_SECRETS_PARAMETER_NAME: props.config.inodraWebhookSecretsParameterName }
        : {}),
      ...(props.config.liveCoinWatchApiKey
        ? { LIVECOINWATCH_API_KEY: props.config.liveCoinWatchApiKey }
        : {}),
    };

    const apiHandler = this.backendFunction("ApiHandler", "api.ts", commonEnvironment);
    const webhookHandler = this.backendFunction(
      "InodraWebhookHandler",
      "inodraWebhook.ts",
      commonEnvironment,
    );

    offersTable.grantReadData(apiHandler);
    loansTable.grantReadData(apiHandler);
    offersTable.grantReadWriteData(webhookHandler);
    loansTable.grantReadWriteData(webhookHandler);
    receiptsTable.grantReadWriteData(webhookHandler);

    if (props.config.inodraWebhookSecretsSecretName) {
      secretsmanager.Secret.fromSecretNameV2(
        this,
        "InodraWebhookSecret",
        props.config.inodraWebhookSecretsSecretName,
      ).grantRead(webhookHandler);
    }
    if (props.config.inodraWebhookSecretsParameterName) {
      ssm.StringParameter.fromSecureStringParameterAttributes(this, "InodraWebhookParameter", {
        parameterName: props.config.inodraWebhookSecretsParameterName,
      }).grantRead(webhookHandler);
    }

    const apiCertificate = new acm.Certificate(this, "ApiCertificate", {
      domainName: props.config.apiDomainName,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    const domainName = new apigwv2.DomainName(this, "ApiDomainName", {
      domainName: props.config.apiDomainName,
      certificate: apiCertificate,
    });

    this.api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "nomad-testnet-api",
      corsPreflight: {
        allowHeaders: ["content-type", "x-inodra-signature", "x-inodra-timestamp", "x-dedupe-key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [`https://${props.config.frontendDomainName}`, "http://localhost:5173"],
        maxAge: Duration.days(1),
      },
    });

    this.api.addRoutes({
      path: "/webhooks/inodra/sui",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebhookIntegration", webhookHandler),
    });
    this.api.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration("ApiIntegration", apiHandler),
    });

    new apigwv2.ApiMapping(this, "ApiMapping", {
      api: this.api,
      domainName,
    });

    new route53.ARecord(this, "ApiARecord", {
      zone: props.hostedZone,
      recordName: recordNameForZone(props.config.apiDomainName, props.config.hostedZoneName),
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
        domainName.regionalDomainName,
        domainName.regionalHostedZoneId,
      )),
    });
    new route53.AaaaRecord(this, "ApiAaaaRecord", {
      zone: props.hostedZone,
      recordName: recordNameForZone(props.config.apiDomainName, props.config.hostedZoneName),
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
        domainName.regionalDomainName,
        domainName.regionalHostedZoneId,
      )),
    });
  }

  private backendFunction(
    id: string,
    entryFile: string,
    environment: Record<string, string>,
  ): nodeLambda.NodejsFunction {
    return new nodeLambda.NodejsFunction(this, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.resolve("..", "backend", "src", "handlers", entryFile),
      projectRoot: path.resolve("..", "backend"),
      depsLockFilePath: path.resolve("..", "backend", "package-lock.json"),
      handler: "handler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
      },
    });
  }
}
