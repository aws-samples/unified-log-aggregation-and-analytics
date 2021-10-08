import * as cdk8s from 'cdk8s';
import * as kplus from 'cdk8s-plus-17';
import { Probe } from 'cdk8s-plus-17';
import * as constructs from 'constructs';
import { KubeNamespace, KubeServiceAccount } from './imports/k8s';

export interface NginxServiceProps {
  iamRoleForK8sSaArn: string;
  nameSpace: string;
  ingressName: string;
  serviceAccountName: string;
}

export class NginxService extends cdk8s.Chart {
  constructor(
    scope: constructs.Construct,
    id: string,
    props: NginxServiceProps,
  ) {
    super(scope, id);

    const namespace = new KubeNamespace(this, props.nameSpace, {
      metadata: { name: props.nameSpace },
    });

    // Create K8S Service Account associated with IAM role for the nginx deployment.
    const serviceAccount = new KubeServiceAccount(
      this,
      props.serviceAccountName,
      {
        metadata: {
          name: props.serviceAccountName,
          namespace: namespace.name,
          annotations: {
            'eks.amazonaws.com/role-arn': props.iamRoleForK8sSaArn,
          },
        },
      },
    );

    // k8s deployment
    const deployment = new kplus.Deployment(this, 'api-deployment', {
      containers: [
        {
          image: 'nginx',
          imagePullPolicy: kplus.ImagePullPolicy.ALWAYS,
          name: 'nginx',
          port: 80,
          liveness: Probe.fromHttpGet('/', {          
            port: 80
          }),
        },        
      ],      
      metadata: {
        name: 'api-deployment',
        namespace: namespace.name,
      },      
      serviceAccount,
    });
    
    deployment.podMetadata.addLabel('app', 'nginx');
    deployment.selectByLabel('app', 'nginx');

    // k8s Service
    const service = new kplus.Service(this, 'api-service', {
      metadata: {
        namespace: namespace.name,
        name: 'api-service',
        labels: {
          app: 'nginx',
        },
        annotations: {
          'alb.ingress.kubernetes.io/target-type': 'ip',
        },
      },
      type: kplus.ServiceType.NODE_PORT,
    });
    service.addDeployment(deployment, 80);
    
    // k8s Ingress
    new kplus.IngressV1Beta1(this, props.ingressName, {
      metadata: {
        name: props.ingressName,
        namespace: namespace.name,
        annotations: {
          'alb.ingress.kubernetes.io/healthcheck-path': '/',
          'kubernetes.io/ingress.class': 'alb',
          'alb.ingress.kubernetes.io/scheme': 'internal',
          'alb.ingress.kubernetes.io/target-type': 'ip',
        },
        labels: { app: 'nginx' },
      },
      rules: [
        {
          path: '/*',
          backend: kplus.IngressV1Beta1Backend.fromService(service),
        },
      ],
    });    
  }  
}