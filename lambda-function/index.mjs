import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBDocumentClient(new DynamoDBClient({ region: "us-east-1" }));
const TABLE_NAME = "AssetState";

export const handler = async (event) => {
  let params;
  
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

  const { action, assetId, issuer, initialSupply, assetName, amount, isValid } = params;
  const assetIdNum = Number(assetId);  // make sure assetId is number

  if (!action 
      || (action === "read" && !assetId) 
      || (action === "AssetRegistered" && (!assetId || !issuer || !initialSupply || !assetName))
      || (action === "AssetVerified" && (!assetId || !isValid))
      || (action === "TokensMinted" && (!assetId || !amount))
      || (action === "TokensRedeemed" && (!assetId || !amount))
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
          Supply: initialSupply
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
    } else {
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