import { readFileSync } from 'fs';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import { CreateKirehoseDataStream } from '../common/utils';
import { LoggingProp } from '../cdk-unified-logs-stack';
import { Duration } from '@aws-cdk/core';
import * as path from 'path';

export class Ec2Logger extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, props: LoggingProp) {

    super(scope, id, props);

    // Security group for EC2 instance
    var securityGroup = new ec2.SecurityGroup(props.stack, 'security-group', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // Allow inbound port 22 (SSH), 80 (Load balancer)
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Port SSH for inbound traffic from IPv4');
    securityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(22), 'Port SSH for inbound traffic from IPv6');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Port 80 for inbound traffic from IPv4');
    securityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80), 'Port 80 for inbound traffic from IPv6');

    // Firehose record transformer for Ec2 plain text logs
    const firehoseTransformer =  new lambda.Function(props.stack, 'Ec2-transformer-function', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(`${path.resolve(__dirname)}/ec2/lambda`),
      memorySize: 1024,
      timeout: Duration.minutes(1),
    });

    // Kinesis hirehose to capture Ec2 plain text logs
    CreateKirehoseDataStream(props.stack, 'ec2-logs-delivery-stream', 'ec2', props.es, props.failureBucket, firehoseTransformer);

    // Create Ec2 instance
    const ec2Instance = new ec2.Instance(props.stack, 'ec2-instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.LARGE),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },      
      keyName: 'hari-new-key-pair',
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
      }),
      securityGroup: securityGroup,      
      role: new iam.Role(props.stack, 'ec2-role', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          new iam.ManagedPolicy(props.stack, 'firehosewriteccess', {
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['firehose:*'],
                resources: ['*'],
              }),
            ],
          }),
          new iam.ManagedPolicy(props.stack, 'cloudwatchAccess', {
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['cloudwatch:*'],
                resources: ['*'],
              }),
            ],
          }),
        ],
      }),
    });

    // Startup script to setup and start kinesis agent
    ec2Instance.addUserData(readFileSync('./lib/computes/ec2/ec2-startup.sh', 'utf8'));    

    // IP Address
    new cdk.CfnOutput(props.stack, 'ec2-ip-address', {
      exportName: 'EC2-IP-Address',
      value: ec2Instance.instancePublicIp,
    });
  }
}