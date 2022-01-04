import * as ecs from '@aws-cdk/aws-ecs';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as cdk from '@aws-cdk/core';
import { CreateKirehoseDataStream } from '../common/utils';
import { LoggingProp } from '../cdk-unified-logs-stack';


export class ECSLogger extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, props: LoggingProp) {

    super(scope, id, props);

    // Kinesis stream to capture ECS logs
    CreateKirehoseDataStream(props.stack, 'ecs-fire-hose-delivery-stream', 'ecs', props.os, props.failureBucket);

    // Create ECS Cluster
    const cluster = new ecs.Cluster(props.stack, 'unified-logger-ecs-cluster', { vpc: props.vpc });

    // ECS Task Definition
    const taskDefinition = new ecs.TaskDefinition(
      props.stack,
      'task',
      {
        family: 'task',
        compatibility: ecs.Compatibility.EC2_AND_FARGATE,
        cpu: '256',
        memoryMiB: '512',
        networkMode: ecs.NetworkMode.AWS_VPC,
      },
    );

    // The docker container including the image to use
    const container = taskDefinition.addContainer('container', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/httpd:latest'),
      memoryLimitMiB: 512,
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'firehose',
          region: props.region,
          delivery_stream: 'ecs-fire-hose-delivery-stream', // firehose stream name
        },
      }),
    });

    // the docker container port mappings within the container
    container.addPortMappings({ containerPort: 80 });

    // ALB for external access
    const loadBalancedFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(props.stack, 'ecs-service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      taskDefinition: taskDefinition,
    });

    // Load balancer URL
    new cdk.CfnOutput(props.stack, 'ecs-load-balancer-url', {
      exportName: 'ECS-Load-balancer-URL',
      value: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
