import * as iam from '@aws-cdk/aws-iam';
import {ManagedPolicy} from '@aws-cdk/aws-iam';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import {CfnDeliveryStream} from '@aws-cdk/aws-kinesisfirehose';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as opensearch from "@aws-cdk/aws-opensearchservice";

export class Utils {}

export function CreateKirehoseDataStream(stack: cdk.Construct, streamName: string, index: string,
  osDomain: opensearch.Domain, rawDataBucket: s3.Bucket, transformer?: lambda.Function): CfnDeliveryStream {

  const firehoseRole = new iam.Role(stack, 'firehoseRole_'+streamName, {
    assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    managedPolicies: [
      new ManagedPolicy(stack, 'policy_'+streamName, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['es:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['lambda:*'],
            resources: ['*'],
          }),
        ],
      }),
    ],
  });

  const firehoseStreamToS3 = new kinesisfirehose.CfnDeliveryStream(stack, 'FirehoseStreamToS3_'+streamName, {
    deliveryStreamName: streamName,
    deliveryStreamType: 'DirectPut',
    amazonopensearchserviceDestinationConfiguration:{
      processingConfiguration: transformer == undefined ? {} : {
        enabled: true,
        processors: [
          {
            type: 'Lambda',
            parameters: [
              { parameterName: 'LambdaArn',
                parameterValue: transformer!.functionArn
              },
            ]
          }
        ]
      },
      retryOptions: {
        durationInSeconds: 5,
      },
      cloudWatchLoggingOptions: {
        enabled: true,
        logGroupName: streamName,
        logStreamName: streamName,
      },
      domainArn: osDomain!.domainArn,
      indexName: index,
      roleArn: firehoseRole.roleArn,
      s3BackupMode: 'FailedDocumentsOnly',
      bufferingHints: {
        intervalInSeconds: 60,
        sizeInMBs: 1,
      },
      s3Configuration: {
        bucketArn: rawDataBucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 1,
        },
        compressionFormat: 'UNCOMPRESSED',
        roleArn: firehoseRole.roleArn,
      },
    },
  });

  firehoseStreamToS3.node.addDependency(osDomain);
  firehoseStreamToS3.node.addDependency(rawDataBucket);
  firehoseStreamToS3.node.addDependency(firehoseRole);

  return firehoseStreamToS3;
}
