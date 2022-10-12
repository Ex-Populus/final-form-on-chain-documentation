const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, Token, AccountLayout } = require('@solana/spl-token');
const { NodeWallet } = require('@metaplex/js');
const { SystemProgram, PublicKey, Connection, Keypair, Transaction, SYSVAR_RENT_PUBKEY, TransactionInstruction } = require("@solana/web3.js");
const fs = require('fs');

const CONNECTION_RPC = "https://api.mainnet-beta.solana.com";

let chachedConn;
const getConnection = (committment) => {
    if (!chachedConn) {
        chachedConn = new Connection(CONNECTION_RPC, committment ?? 'confirmed');
    }
    return chachedConn;
}

const sendTransaction = async ({
    connection,
    wallet,
    tx,
    signers
}) => {

    tx.feePayer = wallet.publicKey
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    if (signers && signers.length) {
        tx.partialSign(...signers);
    }
    const signedTx = await wallet.signTransaction(tx)
    return connection.sendRawTransaction(signedTx.serialize());
}

const waitForTransaction = async (hash, tries) => {
    if (tries > 2) {
        return { err: 'Abort after too many tries for ' + hash };
    }

    const connection = getConnection();
    let tx = null;
    let count = 1;

    try {
        while (tx == null) {
            await sleep(100 * count);
            tx = await connection.getTransaction(hash);
            count++;
            if (count > 25) {
                return { err: 'Abort after 25 tries for ' + hash };
            }
        }
        return tx;

    } catch (ex) {
        console.error("error looking for transaction", ex);
        await waitForTransaction(hash, tries != undefined ? tries++ : 1);
    }


}

const loadLocalWallet = () => {
    const keyFile = JSON.parse(fs.readFileSync(GLOBAL_CONFIG.PATH_TO_LOCAL_KEYPAIR));
    return new NodeWallet(Keypair.fromSeed(Uint8Array.from(keyFile.slice(0, 32))));
}

const findATA = async (mint, owner) => {
    let associatedTokenAccountPubkey = (await PublicKey.findProgramAddress(
        [
            owner.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mint.toBuffer(), // mint address
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];
    return associatedTokenAccountPubkey;
}

const createTokenAccount = async (mint, authority, payer, isAssociated, userWallet) => {

    if (isAssociated) {
        const associatedTokenAddress = await findATA(mint, authority);
        const keys = [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
            { pubkey: authority, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            {
                pubkey: SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            {
                pubkey: SYSVAR_RENT_PUBKEY,
                isSigner: false,
                isWritable: false,
            },
        ];
        const ix = new TransactionInstruction({
            keys,
            programId: ASSOCIATED_TOKEN_PROGRAM_ID,
            data: Buffer.from([]),
        });
        const tx = new Transaction().add(ix);
        const txSig = await sendTransaction({
            connection: getConnection(),
            tx,
            wallet: userWallet,
        });
        return { txSig };
    }

    let balanceNeeded = await Token.getMinBalanceRentForExemptAccount(getConnection());
    const newAccount = Keypair.generate();
    const tx = new Transaction().add(SystemProgram.createAccount({
        fromPubkey: authority,
        newAccountPubkey: newAccount.publicKey,
        lamports: balanceNeeded,
        space: AccountLayout.span,
        programId: TOKEN_PROGRAM_ID,
    }))
    tx.add(Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mint, newAccount.publicKey, authority));

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet,
    });
    return { txSig, newAccountKey: newAccount.publicKey, };
}

const sleep = (delay) => {

    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, delay);
    })

}

const GLOBAL_CONFIG = require("../global.config.json");

module.exports = Utils = {
    getConnection,
    sendTransaction,
    loadLocalWallet,
    findATA,
    createTokenAccount,
    waitForTransaction,

    GLOBAL_CONFIG: GLOBAL_CONFIG,

    RARITY: {
        COMMON: 0,
        RARE: 1,
        EPIC: 2,
        LEGENDARY: 3
    },
    SETS: {
        DAG: 0,
        IP: 1
    },
    HOUSE: {
        MAN: 0,
        MACHINES: 1,
        GODS: 2,
        BEASTS: 3
    }
}