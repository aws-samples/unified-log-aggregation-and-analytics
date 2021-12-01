# Unified log aggregation and analytics across compute platforms

## Introduction

Our customers want to make sure their users have the best experience running their application on AWS. To make this happen, you need to monitor and fix software problems as quickly as possible. Doing this gets challenging with the growing volume of data needing to be quickly detected, analyzed, and stored. In this post, we walk you through an automated process to aggregate and monitor logging-application data in near-real time, so you can remediate application issues faster.

This post shows how to unify and centralize logs across different computing platforms. With this solution, you can unify logs from [Amazon Elastic Compute Cloud](https://aws.amazon.com/ec2/) (Amazon EC2), [Amazon Elastic Container Service](https://aws.amazon.com/ecs/) (Amazon ECS), [Amazon Elastic Kubernetes Service](https://aws.amazon.com/eks/) (Amazon EKS), [Amazon Kinesis Data Firehose](https://aws.amazon.com/kinesis/data-firehose/), and [AWS Lambda](https://aws.amazon.com/lambda/) using agents, log routers, and extensions. We use [Amazon OpenSearch Service](https://aws.amazon.com/opensearch-service/) (successor to Amazon Elasticsearch Service) with OpenSearch Dashboards to visualize and analyze the logs, collected across different computing platforms to get application insights. You can deploy the solution using the [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) (AWS CDK) scripts provided as part of the solution.

## Customer benefits
A unified aggregated log system provides the following benefits:
* A single point of access to all the logs across different computing platforms
* Help defining and standardizing the transformations of logs before they get delivered to downstream systems like [Amazon Simple Storage Service](http://aws.amazon.com/s3) (Amazon S3), Amazon OpenSearch Service, [Amazon Redshift](https://aws.amazon.com/redshift), and other services
* The ability to use Amazon OpenSearch Service to quickly index, and OpenSearch Dashboards to search and visualize logs from its routers, applications, and other devices


## Solution overview

In this post, we use the following services to demonstrate log aggregation across different compute platforms:
* **Amazon EC2** – A web service that provides secure, resizable compute capacity in the cloud. It’s designed to make web-scale cloud computing easier for developers.
* **Amazon ECS** – A web service that makes it easy to run, scale, and manage Docker containers on AWS, designed to make the Docker experience easier for developers.
* **Amazon EKS** – A web service that makes it easy to run, scale, and manage Docker containers on AWS.
* **Kinesis Data Firehose** – A fully managed service that makes it easy to stream data to Amazon S3, Amazon Redshift, or Amazon OpenSearch Service.
* **Lambda** – A compute service that lets you run code without provisioning or managing servers. It’s designed to make web-scale cloud computing easier for developers.
* **Amazon OpenSearch Service** – A fully managed service that makes it easy for you to perform interactive log analytics, real-time application monitoring, website search, and more.

The following diagram shows the architecture of our solution.

![architecture](images/arch.svg)

The architecture uses various log aggregation tools such as log agents, log routers, and Lambda extensions to collect logs from multiple compute platforms and deliver them to Kinesis Data Firehose. Kinesis Data Firehose streams the logs to Amazon OpenSearch Service. Log records that fail to get persisted in Amazon OpenSearch service will get written to AWS S3. To scale this architecture, each of these compute platforms streams the logs to a different Firehose delivery stream, added as a separate index, and rotated every 24 hours.

The following sections demonstrate how the solution is implemented on each of these computing platforms.

### Amazon EC2

The Kinesis agent collects and streams logs from the applications running on EC2 instances to Kinesis Data Firehose. The agent is a standalone Java software application that offers an easy way to collect and send data to Kinesis Data Firehose. The agent continuously monitors files and sends logs to the Firehose delivery stream.

![ec2](images/ec2.svg)

The AWS CDK script provided as part of this solution deploys a simple PHP application that generates logs under the  `/etc/httpd/logs` directory on the EC2 instance. The Kinesis agent is configured via `/etc/aws-kinesis/agent.json` to collect data from `access_logs` and `error_logs`, stream them periodically to Kinesis Data Firehose (`ec2-logs-delivery-stream`).

Because Amazon OpenSearch Service expects data in JSON format, you can add a call to a Lambda function to transform the log data to JSON format within Kinesis Data Firehose before streaming to Amazon OpenSearch Service. The following is a sample input for the data transformer:

**Input:**

```bash
46.99.153.40 - - [29/Jul/2021:15:32:33 +0000] "GET / HTTP/1.1" 200 173 "-" "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36"
```

The following is our output:

```json
{
    "logs" : "46.99.153.40 - - [29/Jul/2021:15:32:33 +0000] \"GET / HTTP/1.1\" 200 173 \"-\" \"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36\"",
}
```

> Notes: We can enhance the Lambda function to extract the timestamp, HTTP, and browser information from the log data, and store them as separate attributes in the JSON document.

### Amazon ECS

In the case of Amazon ECS, we use FireLens to send logs directly to Kinesis Data Firehose. FireLens is a container log router for Amazon ECS and AWS Fargate that gives you the extensibility to use the breadth of services at AWS or partner solutions for log analytics and storage.

![ecs](images/ecs.svg)

The architecture hosts FireLens as a sidecar, which collects logs from the main container running an httpd application and sends them to Kinesis Data Firehose and streams to Amazon OpenSearch Service. The AWS CDK script provided as part of this solution deploys a httpd container hosted behind an Application Load Balancer. The `httpd` logs are pushed to Kinesis Data Firehose (`ecs-logs-delivery-stream`) through the FireLens log router.

### Amazon EKS

With the recent announcement of Fluent Bit support for Amazon EKS, you no longer need to run a sidecar to route container logs from Amazon EKS pods running on Fargate. With the new built-in logging support, you can select a destination of your choice to send the records to. Amazon EKS on Fargate uses a version of Fluent Bit for AWS, an upstream conformant distribution of Fluent Bit managed by AWS.

![eks](images/eks.svg)

The AWS CDK script provided as part of this solution deploys an `NGINX` container hosted behind an internal Application Load Balancer. The `NGINX` container logs are pushed to Kinesis Data Firehose (`eks-logs-delivery-stream`) through the Fluent Bit plugin.

### Amazon Lambda

For Lambda functions, you can send logs directly to Kinesis Data Firehose using the Lambda extension. You can deny the records being written to Amazon CloudWatch.

![lambda](images/lambda.svg)

After deployment, the workflow is as follows:
1. On startup, the extension subscribes to receive logs for the platform and function events. A local HTTP server is started inside the external extension, which receives the logs.
2. The extension buffers the log events in a synchronized queue and writes them to Kinesis Data Firehose via PUT records.
3. The logs are sent to downstream systems.
4. The logs are sent to Amazon OpenSearch Service.

The Firehose delivery stream name gets specified as an environment variable (`AWS_KINESIS_STREAM_NAME`).

For this solution, because we’re only focusing on collecting the run logs of the Lambda function, the data transformer of the Kinesis Data Firehose delivery stream filters out the records of type `function ("type":"function")` before sending it to Amazon OpenSearch Service.

The following is a sample input for the data transformer:

```json
[
   {
      "time":"2021-07-29T19:54:08.949Z",
      "type":"platform.start",
      "record":{
         "requestId":"024ae572-72c7-44e0-90f5-3f002a1df3f2",
         "version":"$LATEST"
      }
   },
   {
      "time":"2021-07-29T19:54:09.094Z",
      "type":"platform.logsSubscription",
      "record":{
         "name":"kinesisfirehose-logs-extension-demo",
         "state":"Subscribed",
         "types":[
            "platform",
            "function"
         ]
      }
   },
   {
      "time":"2021-07-29T19:54:09.096Z",
      "type":"function",
      "record":"2021-07-29T19:54:09.094Z\tundefined\tINFO\tLoading function\n"
   },
   {
      "time":"2021-07-29T19:54:09.096Z",
      "type":"platform.extension",
      "record":{
         "name":"kinesisfirehose-logs-extension-demo",
         "state":"Ready",
         "events":[
            "INVOKE",
            "SHUTDOWN"
         ]
      }
   },
   {
      "time":"2021-07-29T19:54:09.097Z",
      "type":"function",
      "record":"2021-07-29T19:54:09.097Z\t024ae572-72c7-44e0-90f5-3f002a1df3f2\tINFO\tvalue1 = value1\n"
   },   
   {
      "time":"2021-07-29T19:54:09.098Z",
      "type":"platform.runtimeDone",
      "record":{
         "requestId":"024ae572-72c7-44e0-90f5-3f002a1df3f2",
         "status":"success"
      }
   }
]
```

**Output**

```json
{
   "logEvent_1":{
      "time":"2021-07-29T19:54:09.096Z",
      "type":"function",
      "record":"2021-07-29T19:54:09.094Z\tundefined\tINFO\tLoading function\n"
   },
   "logEvent_2":{
      "time":"2021-07-29T19:54:09.097Z",
      "type":"function",
      "record":"2021-07-29T19:54:09.097Z\t024ae572-72c7-44e0-90f5-3f002a1df3f2\tINFO\tvalue1 = value1\n"
   },   
}
```

## Prerequisites

To implement this solution, you need the following prerequisites:

* AWS CLI - AWS Command-Line Interface (CLI) is a unified tool to manage your AWS services. You can read more about it [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
* AWS CDK should be installed in the local laptop, you can read more about it [here](https://docs.aws.amazon.com/cli/latest/userguide/installing.html)
* Git is installed and configured on your machine, you can read more about it [here](https://git-scm.com/downloads)
* AWS Lambda extension for Kinesis Data Firehose is prebuilt and packaged part of this article, you can read more about it [here](https://github.com/aws-samples/aws-lambda-extensions/tree/main/kinesisfirehose-logs-extension-demo)

## Build the code

* Check out the AWS CDK code by running the following command:

```bash
mkdir unified-logs && cd unified-logs
git clone https://github.com/aws-samples/unified-log-aggregation-and-analytics .
```

* Build the lambda extension by running the following command:

```bash
cd lib/computes/lambda/extensions
chmod +x extension.sh
./extension.sh
cd ../../../../
```

* Make sure to replace default AWS region specified under the value of `firehose.endpoint` attribute inside `lib/computes/ec2/ec2-startup.sh`

* Build the code by running the following command:

```bash
yarn install && npm run build
```

## Deploy the code

* If you’re running AWS CDK for the first time, run the following command to bootstrap the AWS CDK environment (provide your AWS account ID and AWS Region):

```bash
cdk bootstrap \
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
    aws://775492342640/us-east-2
```

> Note: You only need to bootstrap the AWS CDK one time (skip this step if you have already done this).

* Run the following command to deploy the code:

```bash
cdk deploy --requires-approval
```

**Output**

```bash
 ✅  CdkUnifiedLogStack

Outputs:
CdkUnifiedLogStack.ec2ipaddress = xx.xx.xx.xx
CdkUnifiedLogStack.ecsloadbalancerurl = CdkUn-ecsse-PY4D8DVQLK5H-xxxxx.us-east-1.elb.amazonaws.com
CdkUnifiedLogStack.ecsserviceLoadBalancerDNS570CB744 = CdkUn-ecsse-PY4D8DVQLK5H-xxxx.us-east-1.elb.amazonaws.com
CdkUnifiedLogStack.ecsserviceServiceURL88A7B1EE = http://CdkUn-ecsse-PY4D8DVQLK5H-xxxx.us-east-1.elb.amazonaws.com
CdkUnifiedLogStack.eksclusterClusterNameCE21A0DB = ekscluster92983EFB-d29892f99efc4419bc08534a3d253160
CdkUnifiedLogStack.eksclusterConfigCommand515C0544 = aws eks update-kubeconfig --name ekscluster92983EFB-d29892f99efc4419bc08534a3d253160 --region us-east-1 --role-arn arn:aws:iam::xxx:role/CdkUnifiedLogStack-clustermasterroleCD184EDB-12U2TZHS28DW4
CdkUnifiedLogStack.eksclusterGetTokenCommand3C33A2A5 = aws eks get-token --cluster-name ekscluster92983EFB-d29892f99efc4419bc08534a3d253160 --region us-east-1 --role-arn arn:aws:iam::xxx:role/CdkUnifiedLogStack-clustermasterroleCD184EDB-12U2TZHS28DW4
CdkUnifiedLogStack.elasticdomainarn = arn:aws:es:us-east-1:xxx:domain/cdkunif-elasti-rkiuv6bc52rp
CdkUnifiedLogStack.s3bucketname = cdkunifiedlogstack-logsfailederrcapturebucket0bcc-xxxxx
CdkUnifiedLogStack.samplelambdafunction = CdkUnifiedLogStack-LambdatransformerfunctionFA3659-c8u392491FrW

Stack ARN:
arn:aws:cloudformation:us-east-1:xxxx:stack/CdkUnifiedLogStack/6d53ef40-efd2-11eb-9a9d-1230a5204572
```

> Note: AWS CDK takes care of building the required infrastructure, deploying the sample application, and collecting logs from different sources to Amazon OpenSearch Service.

The following is some of the key information about the stack:

* **ec2ipaddress** – The public IP address of the EC2 instance, deployed with the sample PHP application
* **ecsloadbalancerurl** – The URL of the Amazon ECS Load Balancer, deployed with the httpd application
* **eksclusterClusterNameCE21A0DB** – The Amazon EKS cluster name, deployed with the NGINX application
* **samplelambdafunction** – The sample Lambda function using the Lambda extension to send logs to Kinesis Data Firehose
* **opensearch-domain-arn**– The ARN of the Amazon OpenSearch Service domain


## Generate logs

To visualize the logs, we need to generate some sample logs. Here is how we can generate them for each of the services:

1. To generate Lambda logs, invoke the function using the following AWS CLI command (run it a few times):

```bash
aws lambda invoke \
    --function-name "<<samplelambdafunction>>" \
    --payload '{"payload": "hello"}' /tmp/invoke-result \
    --cli-binary-format raw-in-base64-out \
    --log-type Tail
```

>Note: Make sure to replace `samplelambdafunction` with the actual lambda function name. Filepath needs to be updated based on the underlaying operating system.

The function should return ```"StatusCode": 200```, with the below output

```bash
{
    "StatusCode": 200,
    "LogResult": "<<Encoded>>",
    "ExecutedVersion": "$LATEST"
}
```

2. Run the following command a couple of times to generate Amazon EC2 logs:

```bash
curl http://ec2ipaddress:80
```

>Note: Make sure to replace `ec2ipaddress` with the public IP address of the EC2 instance

3. Run the following command a couple of times to generate Amazon ECS logs:

```bash
curl http://ecsloadbalancerurl:80
```

>Note: Make sure to replace `ecsloadbalancerurl` with the public ARN of the AWS Application Load Balancer

We deployed the NGINX application with an internal load balancer, so the load balancer hits the health checkpoint of the application, which is sufficient to generate the Amazon EKS access logs.

## Visualize the logs

To visualize the logs, complete the following steps:

1. On the Amazon OpenSearch Service console, choose the hyperlink provided for the OpenSearch Dashboard URL.
2. [2.   Configure access to the OpenSearch Dashboard.](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/dashboards.html)
3. Under **OpenSearch Dashboard**, on the **Discover** menu, start creating a new index pattern for each compute log.


> Note: We can see separate indexes for each compute log partitioned by date, as in the following screenshot.

![all-index](images/all-index.png)

The following screenshot shows the process to create index patterns for Amazon EC2 logs.

![ecs-logs-index](images/ecs-logs-index.png)

After you create the index pattern, we can start analyzing the logs using the Discover menu under OpenSearch Dashboard in the navigation pane. This tool provides a single searchable and unified interface for all the records with various compute platforms. We can switch between different logs using the Change index pattern submenu.

![unified](images/unified.png)

## Cleanup

Run the following command from the root directory to delete the stack:

```bash
cdk destroy
```

> Note: The stack will be deleted after the command is executed.

## Conclusion

In this post, we showed how to unify and centralize logs across different compute platforms using Kinesis Data Firehose and Amazon OpenSearch Service. This approach allows you to analyze logs quickly and the root cause of failures, using a single platform rather than different platforms for different services.
If you have feedback about this post, submit your comments in the comments section.

## Resources

For more information, see the following resources:

* [CDK with EKS on Fargate](https://github.com/aws-samples/cdk-eks-fargate)
* [Ingest streaming data into Amazon Elasticsearch Service within the privacy of your VPC with Amazon Kinesis Data Firehose](https://aws.amazon.com/blogs/big-data/ingest-streaming-data-into-amazon-elasticsearch-service-within-the-privacy-of-your-vpc-with-amazon-kinesis-data-firehose/)
* [Using AWS Lambda extensions to send logs to custom destinations](https://aws.amazon.com/blogs/compute/using-aws-lambda-extensions-to-send-logs-to-custom-destinations/)
* [Custom log routing with ECS using firelens](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_firelens.html)
