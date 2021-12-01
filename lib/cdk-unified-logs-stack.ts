import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as opensearch from '@aws-cdk/aws-opensearchservice';
import * as s3 from '@aws-cdk/aws-s3';
import { Ec2Logger } from './computes/ec2';
import { ECSLogger } from './computes/ecs';
import { EksLogger } from './computes/eks';
import { LambdaLogger } from './computes/lambda';
import { EksDeployment } from './computes/eks/eks-deployments';

export interface LoggingProp extends cdk.NestedStackProps {
  // VPC
  readonly vpc: ec2.IVpc;
  // OpenSearch Domain
  readonly os: opensearch.Domain;
  // Stack
  readonly stack: cdk.Construct;
  // S3 Bucket to save failed records
  readonly failureBucket: s3.Bucket;
  // Region
  readonly region: string;
}

export class CdkUnifiedLogsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'unified-logs-vpc', { natGateways: 1 });

    // OpenSearch
    const osDomain = new opensearch.Domain(this, 'opensearch', {
      version: opensearch.EngineVersion.OPENSEARCH_1_0,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Bucket to save failed records
    const rawDataBucket = new s3.Bucket(this, 'logsFailedErrCaptureBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const loggingProp = {
      vpc: vpc,
      os: osDomain,
      stack: this,
      failureBucket: rawDataBucket,
      region: cdk.Stack.of(this).region
    };

    // Setup EKS infrastructure
    const eksLogger = new EksLogger(this, 'eks-stack', loggingProp);

    // Setup EC2 infrastructure
    const ec2Logger = new Ec2Logger(this, 'ec2-stack', loggingProp);
    ec2Logger.addDependency(eksLogger);

    // Setup serverless lambda infrastructure
    const lambdaLogger = new LambdaLogger(this, 'lambda-stack', loggingProp);
    lambdaLogger.addDependency(ec2Logger);

    // Setup ECS infrastructure
    const ecsLogger = new ECSLogger(this, 'ecs-stack', loggingProp);
    ecsLogger.addDependency(lambdaLogger);

    // Setup EKS deployment, deployments has to wait till load balancer controller pods, due to
    // https://github.com/kubernetes-sigs/aws-load-balancer-controller/issues/2013
    const eksDeployment = new EksDeployment(this, 'eks-deployment', eksLogger.cluster, eksLogger.iamRoleForK8sSa);
    eksDeployment.addDependency(ecsLogger);

    // OpenSearch Domain output
    new cdk.CfnOutput(this, 'opensearch-domain-arn', {
      exportName: 'OpenSearch-Domain',
      value: osDomain.domainArn,
    });

    // S3 Bucket name output
    new cdk.CfnOutput(this, 's3-bucket-name', {
      exportName: 'S3-Bucket-Name',
      value: rawDataBucket.bucketName,
    });
  }
}
