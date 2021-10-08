import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as cdk8s from 'cdk8s';
import { NginxService } from './nginx-service';

export class EksDeployment extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, cluster: eks.FargateCluster, iamRoleForK8sSa: iam.Role) {

    super(scope, id);

    const cdk8sApp = new cdk8s.App();
    const chart = new cdk8s.Chart(cdk8sApp, 'eks-chart');

    cluster.addCdk8sChart(
      'nginx-app-service',
      new NginxService(chart, 'nginx-app-chart', {
        iamRoleForK8sSaArn: iamRoleForK8sSa.roleArn,
        nameSpace: 'nginx',
        ingressName: 'api-ingress',
        serviceAccountName: 'sa-nginx',
      }),
    );    
  }
}