rm -Rf aws-lambda-extensions
git clone https://github.com/aws-samples/aws-lambda-extensions.git
cd aws-lambda-extensions/kinesisfirehose-logs-extension-demo
GOOS=linux GOARCH=amd64 go build -o ../../kinesisfirehose-logs-extension-demo main.go
cd ../..
rm -Rf aws-lambda-extensions