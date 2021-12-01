import * as ec2 from '@aws-cdk/aws-ec2';
import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import * as cdk8s from 'cdk8s';
import { LoggingProp } from '../cdk-unified-logs-stack';
import { CreateKirehoseDataStream } from '../common/utils';
import { AwsLoadBalancerController } from './eks/aws-loadbalancer-controller';
import { EksFargateLogging } from './eks/eks-fargate-logging';

export class EksLogger extends cdk.NestedStack {

  cluster: eks.FargateCluster;
  iamRoleForK8sSa: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: LoggingProp) {

    super(scope, id, props);

    CreateKirehoseDataStream(props.stack, 'eks-fire-hose-delivery-stream', 'eks', props.os, props.failureBucket);

    // EKS Cluster master role
    const masterRole = new iam.Role(props.stack, 'cluster-master-role', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    // Create a EKS cluster with Fargate profile.
    this.cluster = new eks.FargateCluster(props.stack, 'eks-cluster', {
      version: eks.KubernetesVersion.V1_18,
      mastersRole: masterRole,
      outputClusterName: true,
      endpointAccess: eks.EndpointAccess.PUBLIC,
      vpc: props.vpc,

      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE }],
    });

    // Deploy AWS LoadBalancer Controller onto EKS.
    const albLoadBalancer = new AwsLoadBalancerController(props.stack, 'eks-aws-loadbalancer-controller', {
      eksCluster: this.cluster,
    });

    // Create the cdk8s app.
    const cdk8sApp = new cdk8s.App();
    const chart = new cdk8s.Chart(cdk8sApp, 'eks-chart');

    const k8sAppNameSpace = 'nginx';
    const k8sAppServiceAccount = 'sa-nginx';
    const conditions = new cdk.CfnJson(props.stack, 'ConditionJson', {
      value: {
        [`${this.cluster.clusterOpenIdConnectIssuer}:aud`]: 'sts.amazonaws.com',
        [`${this.cluster.clusterOpenIdConnectIssuer}:sub`]: `system:serviceaccount:${k8sAppNameSpace}:${k8sAppServiceAccount}`,
      },
    });

    const iamPrinciple = new iam.FederatedPrincipal(
      this.cluster.openIdConnectProvider.openIdConnectProviderArn,
      {},
      'sts:AssumeRoleWithWebIdentity',
    ).withConditions({
      StringEquals: conditions,
    });
    this.iamRoleForK8sSa = new iam.Role(props.stack, 'nginx-app-sa-role', {
      assumedBy: iamPrinciple,
    });

    // Grant the IAM role S3 permission as an example to show how you can assign Fargate Pod permissions to access AWS resources
    // even though nginx Pod itself does not need to access AWS resources, such as S3.
    const example_s3_bucket = new s3.Bucket(
      props.stack,
      'S3BucketToShowGrantPermission',
      {
        encryption: s3.BucketEncryption.KMS_MANAGED,
      },
    );
    example_s3_bucket.grantRead(this.iamRoleForK8sSa);

    // Apart from the permission to access the S3 bucket above, you can also grant permissions of other AWS resources created in this CDK app to such AWS IAM role.
    // Then in the follow-up CDK8S Chart, we will create a K8S Service Account to associate with this AWS IAM role and a nginx K8S deployment to use the K8S SA.
    // As a result, the nginx Pod will have the fine-tuned AWS permissions defined in this AWS IAM role.

    // Now create a Fargate Profile to host customer app which hosting Pods belonging to nginx namespace.
    const customerAppFargateProfile = this.cluster.addFargateProfile(
      'customer-app-profile',
      {
        selectors: [{ namespace: k8sAppNameSpace }],
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE },
        vpc: this.cluster.vpc,
      },
    );

    const loggingIamPolicy = new iam.ManagedPolicy(props.stack, 'eks-fargate-logging-iam-policy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogStream',
            'logs:CreateLogGroup',
            'logs:DescribeLogStreams',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'firehose:*',
          ],
          resources: ['*'],
        }),
      ],
    });
    customerAppFargateProfile.podExecutionRole.addManagedPolicy(loggingIamPolicy);

    const loggingChart = this.cluster.addCdk8sChart(
      'eks-fargate-logging',
      new EksFargateLogging(chart, 'eks-fargate-logging-chart', props.region),
    );

    loggingChart.node.addDependency(customerAppFargateProfile);
  }
}
