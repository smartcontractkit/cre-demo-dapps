# Chainlink CRE LogTrigger and HTTP Ability Showcase

This repository demonstrates the integration of Chainlink Runtime Environment (CRE) with LogTrigger and HTTP abilities to enable seamless off-chain data orchestration for tokenized assets. The project tokenizes various real-world assets (RWAs) using Ethereum Solidity smart contracts and leverages Chainlink CRE, AWS DynamoDB, and Lambda functions to track the full lifecycle of these tokenized assets.

## Project Overview
### Tokenization and Lifecycle Management
The core of this project is an Ethereum-based Solidity smart contract that facilitates the tokenization of diverse asset classes, including invoices, Treasury bills (T-bills), loans, and carbon credits. Users interact with the contract via specialized functions to manage asset operations, such as:

- Register: Onboard a new asset into the system.
- Verify: Validate asset authenticity and compliance.
- Transfer: Execute peer-to-peer asset transfers.
- Redeem: Liquidate or burn tokens to redeem underlying value.

To support generalized use cases, regulators, auditors, and investors require robust monitoring and auditing capabilities for these tokenized assets and their associated operations. While on-chain data is immutable and verifiable via the blockchain, querying it directly is inefficient and lacks user-friendly interfaces due to the opaque nature of raw transaction logs.

This project addresses these challenges by employing Chainlink CRE to bridge on-chain events with off-chain storage and retrieval. Specifically:

- Chainlink CRE's LogTrigger captures events emitted by the tokenization platform contract.
- Extracted event data is parsed, normalized, and encapsulated into a structured HTTP payload.
- The HTTP Ability dispatches this payload as a RESTful API request to an AWS Lambda function.
- The Lambda function persists the processed data into an AWS DynamoDB NoSQL database, enabling efficient querying via secondary indexes and flexible schemas.

All critical orchestration logic—including LogTrigger configuration, HTTP request formatting, and error handling—is encapsulated within Chainlink CRE workflows, ensuring modular, reusable, and scalable deployment.

This architecture decouples on-chain immutability from off-chain accessibility, providing stakeholders with near-real-time visibility into asset lifecycles without compromising blockchain integrity.

## Getting Started
### Prerequisites
Before proceeding, ensure the following are set up:
- Chainlink CRE installed and configured.
- Node.js (v18+ recommended) for script execution.
- Ethereum Sepolia testnet access (e.g., via Alchemy or Infura RPC endpoint).
- Sepolia test tokens (ETH and any required ERC-20/ERC-1155 tokens) for gas and interactions.
- AWS account (Free Tier eligible) with IAM roles for DynamoDB and Lambda.

### Usage Steps
Follow these steps to deploy and interact with the project:
1. Update Configuration Files
    
    Rename project.ya
    
    Add your ethereum RPC url to `project.yaml` under the root directory. If you don't have a RPC url, use the following one. The `project.yaml` should be look like this:
    ```
    local-simulation:
    rpcs:
        - chain-name: ethereum-testnet-sepolia
        url: https://por.bcy-p.metalhosts.com/cre-alpha/MvqtrdftrbxcP3ZgGBJb3bK5/ethereum/sepolia
    ```

2. Deploy Smart Contracts and add addr to config

    The contract source code can be found in [TokenizedAssetPlatform.sol](contracts/abi/TokenizedAssetPlatform.ts). Use Remix to deploy the smart contract to the Ethereum Sepolia testnet. 
    
    Rename `config.json.example` to `config.json`. Update `assetAddress` in file [config.json](asset-log-trigger-workflow/config.json). The updated config file should have the evms config as below:
    ```
    "evms": [
        {
        "assetAddress": "<YOUR DEPLOYED CONTRACT ADDR>",
        "chainSelectorName": "ethereum-testnet-sepolia",
        "gasLimit": "1000000"
        }
    ]
    ```

3. Create DynamoDB Table

    In the AWS Management Console, search dynamoDB on search bar. Create table named `AssetState`(or any other name you like) with a composite primary key: AssetId (partition key, String). Page to create DynamoDB table is as below:
    ![alt text](<images/create-table.png>)


4. Create Lambda Function

    Search lambda function in AWS dashboard search bar. Create a new function with nodejs.22 environment as below. 
    ![alt text](<images/create-lambda-function.png>)

    Open the function and copy the file [index.mjs](lambda-function/index.mjs) under Code tab, and click blue button "deploy" on the down left to deploy the lambda function.
    ![alt text](<images/lambda-function-code.png>)

    When the code is deployed, go to Configuration->Function URL and click the button "Create function URL" to create a URL for the function. IN Auth Type, choose NONE for the Function URL. The page is like below:
    ![alt text](<images/create-function-url.png>)

    Grant the DynamoDB full permission to the lambda function so that the function can read and update data in DynamoDB table. Search "IAM" in search bar and click "Role" on the left panel, and find and click the role for your lambda function(usually the name of the role starts with your lambda function name).
    ![alt text](<images/function-role.png>)

    Add permission to the role. Click the "Add permissions"->"Attach policies". In the policy page, select permission policy "AmazonDynamoDBFullAccess" and click "Add Permission" to add the policy to the role.
    ![alt text](<images/add-permission.png>)

    You will find the "AmazonDynamoDBFullAccess" under the role if it is added successfully. 
    ![alt text](<images/role-policies.png>)

    Finally, add the Function URL to file `asset-log-trigger-workflow/config.json`. This line should be in the file:
    ```
    "url": "<YOUR LAMBDA FUNCTION URL>",
    ```

5. Install node dependencies
    
    Install node deps for the workflow with commands below:
    ```shell
    cd asset-log-trigger-workflow
    bun install
    ```
6. Register an Asset

    On remix, call the function `registerAsset` of deployed TokenizedAssetPlatform contract with params: 
    - name: "Invoice-01"
    - symbol: "IVC1"
    - initialSupply: 1000000
    - _uri: ""
    - issuer: 0x"YOUR WALLET ADDRESS"

    run command below to trigger the CRE with event log.
    ```shell
    cre workflow simulate asset-log-trigger-workflow --broadcast --target local-simulation
    ```
    
    Enter hash of the transaction you just sent and 1 for transaction hash and index in the terminal. Example is like below:
    ```shell
    Enter transaction hash (0x...): 0x495df84e1d1d2dc382671dd96c4ce5f407f726f5a63bff3cd81c47969508f042
    Enter event index (0-based): 1
    ```

    In the DynamoDB, you will see a new record put. 
    ![alt text](<images/asset-registration.png>)


7. Verify an Asset

    On remix, call the function `verifyAsset` of deployed TokenizedAssetPlatform contract with params: 
    - assetId: 1
    - isValid: 1

    run command below to trigger the CRE with event log.
    ```shell
    cre workflow simulate asset-log-trigger-workflow --broadcast --target local-simulation
    ```
    
    Enter hash of the transaction you just sent and 0 for transaction hash and index in the terminal. Example is like below:
    ```shell
    Enter transaction hash (0x...): 0xc11ca0c706f4897b16ca94c5225fbd0982ebcf4a2972b7536378f3c209abbe10
    Enter event index (0-based): 0
    ```

    In the DynamoDB, you will see a new record put. 
    ![alt text](<images/asset-verification.png>)

8. Mint Tokens

    On remix, call the function `mint` of deployed TokenizedAssetPlatform contract with params: 
    - to: 0x"YOUR WALLET ADDR"
    - assetId: 1
    - amount: 100
    - reason: ""

    run command below to trigger the CRE with event log.
    ```shell
    cre workflow simulate asset-log-trigger-workflow --broadcast --target local-simulation
    ```
    
    Enter hash of the transaction you just sent and 1 for transaction hash and index in the terminal. Example is like below:
    ```shell
    Enter transaction hash (0x...): 0x578032166b30ea921b0fb38e415bd1dd153edec899e05e07568953750f8dbff0
    Enter event index (0-based): 1
    ```

    In the DynamoDB, you will see a new record put. 
    ![alt text](<images/token-minted.png>)

9. Redeem Tokens

    On remix, call the function `redeem` of deployed TokenizedAssetPlatform contract with params: 
    - assetId: 1
    - amount: 10
    - settlementDetail: ""

    run command below to trigger the CRE with event log.
    ```shell
    cre workflow simulate asset-log-trigger-workflow --broadcast --target local-simulation
    ```
    
    Enter hash of the transaction you just sent and 1 for transaction hash and index in the terminal. Example is like below:
    ```shell
    Enter transaction hash (0x...): 0xc6764610b2886dc91b73c388407a6bd9920a3c0f176fae23070b3cb992fdc8c1
    Enter event index (0-based): 1
    ```

    In the DynamoDB, you will see a new record put. 
    ![alt text](<images/token-redeemed.png>)

# Troubleshooting
- AWS Lambda Internal Server Error on Invocation

    Verify that the Lambda execution role has the necessary IAM permissions for DynamoDB operations (e.g., dynamodb:PutItem, dynamodb:UpdateItem). Attach a policy like AmazonDynamoDBFullAccess temporarily for debugging, then refine to least-privilege principles. Check CloudWatch Logs for detailed error traces.

- Chainlink CRE Fails to Detect Events

    Transactions may emit multiple events in sequence; ensure the LogTrigger targets the correct event index. For instance, during asset registration, two events are emitted—the second (AssetRegistered) is the trigger. Adjust the workflow's eventIndex parameter accordingly. Use Etherscan to inspect raw logs and correlate with CRE configuration.

- Solidity Compilation Errors (Override Mismatch or Inheritance Issues)

    These often stem from version incompatibilities in OpenZeppelin contracts. Use OpenZeppelin v5.x for ERC-1155 implementations explicitly if remix use other version of OZ contracts.

