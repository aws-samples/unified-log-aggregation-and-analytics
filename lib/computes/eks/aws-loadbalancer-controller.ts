import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';

export interface AwsLoadBalancerControllerProps {
  eksCluster: eks.ICluster;
}

interface HelmValues {
  [key: string]: unknown;
}

export class AwsLoadBalancerController extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: AwsLoadBalancerControllerProps,
  ) {
    super(scope, id);

    // Create an K8S Service Account for AWS Load Balancer Controller on EKS cluster.
    // @aws-cdk/aws-eks module will also automatically create the corresponding IAM Role mapped via IRSA
    const awsLbControllerServiceAccount = props.eksCluster.addServiceAccount(
      'aws-load-balancer-controller',
      {
        name: 'aws-load-balancer-controller',
        namespace: 'kube-system',
      },
    );

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:CreateServiceLinkedRole',
        'ec2:*',        
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeLoadBalancerAttributes',
        'elasticloadbalancing:DescribeListeners',
        'elasticloadbalancing:DescribeListenerCertificates',
        'elasticloadbalancing:DescribeSSLPolicies',
        'elasticloadbalancing:DescribeRules',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeTargetGroupAttributes',
        'elasticloadbalancing:DescribeTargetHealth',
        'elasticloadbalancing:DescribeTags',
      ],
      resources: ['*'],
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:DescribeUserPoolClient',
        'acm:ListCertificates',
        'acm:DescribeCertificate',
        'iam:ListServerCertificates',
        'iam:GetServerCertificate',
        'waf-regional:GetWebACL',
        'waf-regional:GetWebACLForResource',
        'waf-regional:AssociateWebACL',
        'waf-regional:DisassociateWebACL',
        'wafv2:GetWebACL',
        'wafv2:GetWebACLForResource',
        'wafv2:AssociateWebACL',
        'wafv2:DisassociateWebACL',
        'shield:GetSubscriptionState',
        'shield:DescribeProtection',
        'shield:CreateProtection',
        'shield:DeleteProtection',
      ],
      resources: ['*'],
    }));      

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:CreateLoadBalancer',
        'elasticloadbalancing:CreateTargetGroup',
      ],
      resources: ['*'],
      conditions: {
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:CreateListener',
        'elasticloadbalancing:DeleteListener',
        'elasticloadbalancing:CreateRule',
        'elasticloadbalancing:DeleteRule',
      ],
      resources: ['*'],
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:AddTags',
        'elasticloadbalancing:RemoveTags',
      ],
      resources: ['arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
        'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
        'arn:aws:elasticloadbalancing:*:*:targetgroup/*'],
      conditions: {
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:AddTags',
        'elasticloadbalancing:RemoveTags',
      ],
      resources: [
        'arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*'
      ]
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:ModifyLoadBalancerAttributes',
        'elasticloadbalancing:SetIpAddressType',
        'elasticloadbalancing:SetSecurityGroups',
        'elasticloadbalancing:SetSubnets',
        'elasticloadbalancing:DeleteLoadBalancer',
        'elasticloadbalancing:ModifyTargetGroup',
        'elasticloadbalancing:ModifyTargetGroupAttributes',        
        'elasticloadbalancing:DeleteTargetGroup',
      ],
      resources: ['*'],
      conditions: {
        Null: {
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:RegisterTargets',
        'elasticloadbalancing:DeregisterTargets'
      ],
      resources: ['arn:aws:elasticloadbalancing:*:*:targetgroup/*/*']
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:SetWebAcl',
        'elasticloadbalancing:ModifyListener',
        'elasticloadbalancing:AddListenerCertificates',
        'elasticloadbalancing:RemoveListenerCertificates',
        'elasticloadbalancing:ModifyRule',
      ],
      resources: ['*'],
    }));

    awsLbControllerServiceAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'acm:DescribeCertificate',
        'acm:ListCertificates',
        'acm:GetCertificate',
      ],
      resources: ['*'],
    }));        

    // Deploy AWS LoadBalancer Controller from the Helm chart
    const stack = cdk.Stack.of(this);
    const lbHelmValues = {} as HelmValues;
    lbHelmValues.clusterName = props.eksCluster.clusterName;
    lbHelmValues.region = stack.region;
    lbHelmValues.vpcId = props.eksCluster.vpc.vpcId;
    lbHelmValues.serviceAccount = {
      create: false,
      name: 'aws-load-balancer-controller',
    };
    props.eksCluster.addHelmChart('aws-load-balancer-controller', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: lbHelmValues,
    });
  }
}