const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');

const waitForConfirmation = async function (algodClient, txId, timeout) {
    if (algodClient == null || txId == null || timeout < 0) {
        throw new Error("Bad arguments");
    }

    const status = (await algodClient.status().do());
    if (status === undefined) {
        throw new Error("Unable to get node status");
    }

    const startround = status["last-round"] + 1;
    let currentround = startround;

    while (currentround < (startround + timeout)) {
        const pendingInfo = await algodClient.pendingTransactionInformation(txId).do();
        if (pendingInfo !== undefined) {
            if (pendingInfo["confirmed-round"] !== null && pendingInfo["confirmed-round"] > 0) {
                //Got the completed Transaction
                return pendingInfo;
            } else {
                if (pendingInfo["pool-error"] != null && pendingInfo["pool-error"].length > 0) {
                    // If there was a pool error, then the transaction has been rejected!
                    throw new Error("Transaction " + txId + " rejected - pool error: " + pendingInfo["pool-error"]);
                }
            }
        }

        await algodClient.statusAfterBlock(currentround).do();
        currentround++;
    }

    throw new Error("Transaction " + txId + " not confirmed after " + timeout + " rounds!");
};

// create new application
async function createApp(client, creatorAccount, approvalProgram, clearProgram, localInts, localBytes, globalInts, globalBytes) {
    // define sender as creator
    let sender = creatorAccount.addr;

    // declare onComplete as NoOp
    const onComplete = algosdk.OnApplicationComplete.NoOpOC;

	// get node suggested parameters
    let params = await client.getTransactionParams().do();
    // comment out the next two lines to use suggested fee
    params.fee = 1000;
    params.flatFee = true;

    // create unsigned transaction
    // https://github.com/algorand/js-algorand-sdk/blob/develop/src/makeTxn.ts#L1080
    let txn = algosdk.makeApplicationCreateTxn(sender, params, onComplete, 
                                            approvalProgram, clearProgram, 
                                            localInts, localBytes, globalInts, globalBytes);
    let txId = txn.txID().toString();

    // Sign the transaction
    let signedTxn = txn.signTxn(creatorAccount.sk);
    console.log("Signed transaction with txID: %s", txId);

    // Submit the transaction
    await client.sendRawTransaction(signedTxn).do();

    // Wait for confirmation
    await waitForConfirmation(client, txId, 4);

    // display results
    let transactionResponse = await client.pendingTransactionInformation(txId).do();
    let appId = transactionResponse['application-index'];
    console.log("Created new app-id: ",appId);
    return appId;
}

async function main() {
    try {
        // connect to sandbox client
        const algodServer = "http://localhost";
        const algodToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        const algodPort = 4001;
        const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

        // get the creator account 
        const creatorMnemonic = "already chalk result film time like kiss rib course artwork shy fiscal enrich wrong artefact mansion slam electric gorilla response mother gorilla bottom absorb tube";
        let creatorAccount = algosdk.mnemonicToSecretKey(creatorMnemonic);

        // compile the approval program
        let filePath = path.join(__dirname, 'approvalProgramSourceInitial.teal');
        const approvalProgramSource = fs.readFileSync(filePath);
        // console.log(approvalProgramSource)
        let compiledApprovalResult = await algodClient.compile(approvalProgramSource).do();
        // console.log("Result = " + compiledApprovalResult.result);
        let compiledApprovalBytes = new Uint8Array(Buffer.from(compiledApprovalResult.result, "base64"));

        // compile the clear program
        filePath = path.join(__dirname, 'clearProgramSource.teal');
        const clearProgramSource = fs.readFileSync(filePath);
        // console.log(clearProgramSource)
        let compiledClearResult = await algodClient.compile(clearProgramSource).do();
        // console.log("Result = " + compiledClearResult.result);
        let compiledClearBytes = new Uint8Array(Buffer.from(compiledClearResult.result, "base64"));

        // declare application state storage (immutable)
        const localInts = 1;
        const localBytes = 1;
        const globalInts = 1;
        const globalBytes = 0;

        await createApp(algodClient, creatorAccount, compiledApprovalBytes, compiledClearBytes,
            localInts, localBytes, globalInts, globalBytes);

    } catch (err) {
        console.log("err", err);  
    }
    
}

main();