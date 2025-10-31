import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as crypto from "crypto";
import https from "https";
import { URL } from "url";

export const handler = async (event) => {
    let params;
  
    // please define the region before deploy the function
    // you can find the region on the top right. eg. "us-east-1"
    const yourAwsRegion = ""

    if(!yourAwsRegion) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "region is null, please define the region." })
            };
        }

    const client = new DynamoDBDocumentClient(new DynamoDBClient({ region: yourAwsRegion }));
    const TABLE_NAME = "AssetState";

  // debug
  console.log("event:", event);
  
  try {
      params = JSON.parse(event.body);
  } catch (parseError) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON in request body" })
    };
  }

  // debug
  console.log("params:", params);

  const { action, assetId, issuer, initialSupply, assetName, amount, isValid, apiUrl } = params;
  const assetIdNum = Number(assetId);  // make sure assetId is number

  if (!action 
      || (action === "read" && !assetId) 
      || (action === "AssetRegistered" && (!assetId || !issuer || !initialSupply || !assetName))
      || (action === "AssetVerified" && (!assetId || !isValid))
      || (action === "TokensMinted" && (!assetId || !amount))
      || (action === "TokensRedeemed" && (!assetId || !amount))
      /* 
       **NOTE**:
        Please be noticed that the CRE http trigger is not supported in the simulation mode. 
        In order to use this action, the CRE workflow needs to be deployed on mainnet.
        Action "sendNotification" is not used in the demo, 
        and the purpose of this action in lambda is to show how to send a POST request to CRE.
      */
      || (action === "sendNotification" && (!assetId || !apiUrl))
    ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters" })
    };
  }

  try {
    if (action === "read") {
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          AssetId: assetId 
        }
      });

      const result = await client.send(getCommand);
      const item = result.Item || null;

      return {
        statusCode: 200,
        body: JSON.stringify({ data: item })
      };
    } else if (action === "AssetRegistered") {
      
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          AssetId: assetId, 
          AssetName: assetName,
          Issuer: issuer,
          Supply: initialSupply,
          Uid: crypto.randomUUID(),
        }
      });

      await client.send(putCommand);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Asset registered successfully" })
      };
    } else if(action == "AssetVerified") {

      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          AssetId: assetId
        }
      });

      const getResult = await client.send(getCommand);
      const currentItem = getResult.Item || {};
      const updateItem = { ...currentItem, Verified: isValid } 

      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: updateItem
      });

      await client.send(putCommand);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Asset verified successfully", isValid})
      };
    } else if(action == "TokensMinted"){
      // get existing item
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          AssetId: assetId
        }
      });
      const getResult = await client.send(getCommand);
      const currentItem = getResult.Item || {};
      const currentAmount = currentItem.TokenMinted || "0";

      // update the value
      const newAmount = BigInt(currentAmount) + BigInt(amount);
      
      // prepare new item for DB
      const updateItem = { ...currentItem, TokenMinted: newAmount.toString() } 

      // put the updated item to the record
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: updateItem
      });

      await client.send(putCommand);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "New Token minted successfully", amount}) 
      };

    } else if(action == "TokensRedeemed") {
      // get existing item
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          AssetId: assetId
        }
      });
      const getResult = await client.send(getCommand);
      const currentItem = getResult.Item || {};
      const currentAmount = currentItem.TokenRedeemed || "0";

      // update the value
      const newAmount = BigInt(currentAmount) + BigInt(amount);
      
      // prepare new item for DB
      const updateItem = { ...currentItem, TokenRedeemed: newAmount.toString() } 

      // put the updated item to the record
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: updateItem
      });

      await client.send(putCommand);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Token redeemed successfully", amount}) 
      };      
    } else if (action =="sendNotification") {
      /* 
       **NOTE**:
        This branch is used to send a POST request to CRE while the capability require that CRE workflow deployed on mainnet.
        In the demo, the action will not be used, and the purpose of this branch is to show how to send a POST request to CRE.
      */
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          AssetId: assetId
        }
      });
      const getResult = await client.send(getCommand);
      const item = getResult.Item;

      if (!item?.Uid) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Asset UID not found" })
        };
      }

      const uid = item.Uid;
      const postData = JSON.stringify({ 
        assetId: assetIdNum, 
        uid 
      });

      const parsedUrl = new URL(apiUrl);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const postRequest = () => {
        return new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              resolve({ statusCode: res.statusCode, body: data });
            });
          });

          req.on("error", (err) => {
            reject(err);
          });

          req.write(postData);
          req.end();
        });
      };

      const response = await postRequest();

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          statusCode: 200,
          body: JSON.stringify({ message: "POST request sent successfully", assetId: assetIdNum, uid, apiResponse: response.body })
        };
      } else {
        return {
          statusCode: response.statusCode,
          body: JSON.stringify({ error: "POST request failed", assetId: assetIdNum, uid, apiResponse: response.body })
        };
      }
    }else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid action. Use 'read' or 'write'." })
      };
    }
  } catch (error) {
    console.error("DynamoDB Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};