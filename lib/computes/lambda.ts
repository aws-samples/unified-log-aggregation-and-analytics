import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import { CreateKirehoseDataStream } from '../common/utils';
import { LoggingProp } from '../cdk-unified-logs-stack';
import { Duration } from '@aws-cdk/core';
import * as path from 'path';

export class LambdaLogger extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, props: LoggingProp) {

    super(scope, id, props);

    // Firehose record transformer for lambda function logs
    const firehoseTransformer =  new lambda.Function(props.stack, 'lambda-serverless-transformer-function', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/lambda/transformer`),
      memorySize: 1024,
      timeout: Duration.minutes(1),
    });

    // Kinesis firehose to capture lambda function execution logs
    CreateKirehoseDataStream(props.stack, 'lambda-logs-delivery-stream', 'lambda', props.os, props.failureBucket,
                            firehoseTransformer);

    // IAM Role
    const lambdaRole = new iam.Role(props.stack, 'lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        new iam.ManagedPolicy(props.stack, 'lambdafirehosewriteccess', {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['firehose:*'],
              resources: ['*'],
            }),
          ],
        }),
        new iam.ManagedPolicy(props.stack, 'lambdacloudwatchAccess', {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.DENY, // deny sending logs to CloudWatch
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              resources: ['arn:aws:logs:*:*:*'],
            }),
          ],
        }),
        iam.ManagedPolicy.fromManagedPolicyArn(props.stack, 'lambdabasic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
      ],
    });

    // Extension to directly send logs to kinesis firehose
    const firehoseExtensionLayer = new lambda.LayerVersion(props.stack, 'firehose-layer', {
      compatibleRuntimes: [
        lambda.Runtime.GO_1_X,
        lambda.Runtime.NODEJS_14_X,
      ],
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/lambda/extensions`),
      description: 'Kinesis firehose log extension',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Sample lambda function
    const sampleLambdaFunction =  new lambda.Function(props.stack, 'Lambda-transformer-function', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/lambda/handler`),
      memorySize: 1024,
      timeout: Duration.minutes(1),
      layers: [firehoseExtensionLayer],
      role: lambdaRole,
      environment: {
        'AWS_KINESIS_STREAM_NAME': 'lambda-logs-delivery-stream'
      }
    });

    // CDK output
    new cdk.CfnOutput(props.stack, 'sample-lambda-function', {
      exportName: 'Sample-Lambda-Function',
      value: sampleLambdaFunction.functionName,
    });
  }
}
