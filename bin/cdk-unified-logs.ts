#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkUnifiedLogsStack } from '../lib/cdk-unified-logs-stack';

const app = new cdk.App();
new CdkUnifiedLogsStack(app, 'CdkUnifiedLogStack', {});
