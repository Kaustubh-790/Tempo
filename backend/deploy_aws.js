import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { EC2Client, CreateKeyPairCommand } from "@aws-sdk/client-ec2";
import fs from "fs";
import path from "path";

const region = "ap-south-1";
// AWS Credentials should be provided via environment variables:
// AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
// DO NOT HARDCODE SECRETS IN THIS FILE.

const ec2Client = new EC2Client({ region });
const cfnClient = new CloudFormationClient({ region });

const stackName = "chess-server-deployment";
const keyName = "chess-server-key-" + Date.now();
const templatePath = path.resolve("../aws-deployment.yaml");

async function deploy() {
  try {
    console.log(`Creating EC2 Key Pair: ${keyName}`);
    const keyPairResult = await ec2Client.send(new CreateKeyPairCommand({ KeyName: keyName }));
    const keyPath = path.resolve(`../${keyName}.pem`);
    fs.writeFileSync(keyPath, keyPairResult.KeyMaterial);
    console.log(`Saved SSH Key to: ${keyPath}`);

    const templateBody = fs.readFileSync(templatePath, "utf-8");

    console.log(`Deploying CloudFormation Stack: ${stackName}...`);
    const cfnResult = await cfnClient.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: [
        { ParameterKey: "KeyName", ParameterValue: keyName },
        { ParameterKey: "InstanceType", ParameterValue: "t3.micro" },
        { ParameterKey: "RepoUrl", ParameterValue: "https://github.com/Kaustubh-790/Chess-Server.git" },
        { ParameterKey: "DomainName", ParameterValue: "chess.local" },
        { ParameterKey: "MongoDBUri", ParameterValue: "mongodb+srv://kaustubhsharma434:OkEYWhmF4NGWxkD9@cluster0.rqs86jm.mongodb.net/chessEngine?retryWrites=true&w=majority&appName=Cluster0" },
        { ParameterKey: "JwtSecret", ParameterValue: "c9f4b2e7a1d84c6fb3e92a71d5c8f0e4b6a3d9f2c7e1b8a4d6f0c3e9a2b7d5f1" },
        { ParameterKey: "ClientUrl", ParameterValue: "http://localhost:5173" }
      ]
    }));

    console.log("Stack creation initiated! This will take a few minutes.");
    console.log("StackId:", cfnResult.StackId);
    
    // Wait for completion
    let status = "CREATE_IN_PROGRESS";
    while (status === "CREATE_IN_PROGRESS") {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const res = await cfnClient.send(new DescribeStacksCommand({ StackName: stackName }));
      status = res.Stacks[0].StackStatus;
      console.log(`Current status: ${status}`);
      if (status === "CREATE_COMPLETE") {
        const outputs = res.Stacks[0].Outputs;
        console.log("\nDeployment Successful! Outputs:");
        outputs.forEach(o => console.log(`${o.OutputKey}: ${o.OutputValue}`));
        break;
      } else if (status.includes("FAILED") || status.includes("ROLLBACK")) {
        console.error("Deployment failed:", res.Stacks[0].StackStatusReason);
        break;
      }
    }
  } catch (error) {
    console.error("Error during deployment:", error);
  }
}

deploy();
