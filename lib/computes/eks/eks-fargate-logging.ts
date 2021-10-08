import * as cdk8s from 'cdk8s';
import * as kplus from 'cdk8s-plus-17';
import * as constructs from 'constructs';
import { KubeNamespace } from './imports/k8s';

export class EksFargateLogging extends cdk8s.Chart {
  constructor(
    scope: constructs.Construct,
    id: string,
    region: string
  ) {
    super(scope, id);

        const eksFargateLoggingNamespace = 'aws-observability';
        const namespace = new KubeNamespace(this, eksFargateLoggingNamespace, {
            metadata: { 
                name: eksFargateLoggingNamespace, 
                labels: {
                    'aws-observability': 'enabled'
                }
            },
        });
                
        const cmArray: Array<string> = [
            '[OUTPUT]',
            '    Name kinesis_firehose',
            '    Match   *',
            `    region ${region}`,
            '    delivery_stream eks-fire-hose-delivery-stream',
        ];
        const cmString = cmArray.join('\n');
        const cmName = 'aws-logging';

        const loggingConfigMap = new kplus.ConfigMap(this, cmName, {
            metadata: {
                name: cmName,
                namespace: eksFargateLoggingNamespace,
            },
            data: {
                'output.conf': cmString
            }
        });

  }
}